<?php
// ============================================================
//  FitCore — Single-File MySQL API
//  PHP 7.2+ compatible (no union types, no mixed, no fn=>)
//  Place at: C:\xampp\htdocs\fitcore\api.php
// ============================================================

// ── CORS & JSON headers — MUST be first ──────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Allow large JSON bodies for avatar uploads (base64 images) ─
ini_set('post_max_size',       '16M');
ini_set('upload_max_filesize', '16M');

// ── Turn PHP errors into JSON, not HTML ──────────────────────
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    http_response_code(500);
    echo json_encode(array(
        'error' => "PHP Error [$errno]: $errstr in $errfile on line $errline"
    ));
    exit;
});
set_exception_handler(function($e) {
    http_response_code(500);
    echo json_encode(array('error' => 'Exception: ' . $e->getMessage()));
    exit;
});

// ── DATABASE CONFIG ───────────────────────────────────────────
define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'fitcore_db');

// ── Connection ────────────────────────────────────────────────
function db() {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT
         . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASS, array(
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ));
    // Allow large packets so base64 avatar images can be stored
    try { $pdo->exec('SET SESSION max_allowed_packet = 16777216'); } catch(Exception $e) {}
    return $pdo;
}

// ── Helpers ───────────────────────────────────────────────────
function ok($data, $code) {
    if ($code === null) $code = 200;
    http_response_code($code);
    echo json_encode($data === null ? array() : $data);
    exit;
}
function err($msg, $code) {
    if ($code === null) $code = 400;
    http_response_code($code);
    echo json_encode(array('error' => $msg));
    exit;
}
function getBody() {
    $raw = file_get_contents('php://input');
    if (!$raw) return array();
    $data = json_decode($raw, true);
    return is_array($data) ? $data : array();
}
function dbOne($sql, $p) {
    $s = db()->prepare($sql);
    $s->execute($p);
    $r = $s->fetch();
    return $r ? $r : null;   // return array or null — no union types
}
function dbAll($sql, $p) {
    $s = db()->prepare($sql);
    $s->execute($p);
    return $s->fetchAll();
}
function dbVal($sql, $p) {
    $s = db()->prepare($sql);
    $s->execute($p);
    return $s->fetchColumn();
}
function dbRun($sql, $p) {
    $s = db()->prepare($sql);
    $s->execute($p);
}

// ── Route ─────────────────────────────────────────────────────
$action = isset($_GET['action']) ? $_GET['action'] : '';

// ── PING ──────────────────────────────────────────────────────
if ($action === 'ping') {
    try {
        db();
        ok(array('status' => 'ok', 'php' => PHP_VERSION, 'db' => DB_NAME), 200);
    } catch (PDOException $e) {
        err('DB connection failed: ' . $e->getMessage(), 500);
    }
}

// ── MAKE HASHES (run once to fix the DB, then remove) ─────────
// Visit: http://localhost/fitcore/api.php?action=fix_passwords
// This re-hashes all auth_users rows that have plain-text passwords.
if ($action === 'fix_passwords') {
    $rows = dbAll('SELECT id, password FROM auth_users', array());
    $fixed = 0;
    foreach ($rows as $r) {
        // If not a valid bcrypt hash, hash it now
        if (substr($r['password'], 0, 4) !== '$2y$') {
            $hash = password_hash($r['password'], PASSWORD_BCRYPT);
            dbRun('UPDATE auth_users SET password=? WHERE id=?',
                  array($hash, $r['id']));
            $fixed++;
        }
    }
    ok(array('fixed' => $fixed, 'message' => "$fixed password(s) hashed. Login should work now."), 200);
}

// ── SQL PROXY ─────────────────────────────────────────────────
function fixSql($sql) {
    $sql = preg_replace("/datetime\('now'\)/i", 'NOW()', $sql);
    $sql = preg_replace("/(?<![_a-zA-Z])date\('now'\)/i", 'CURDATE()', $sql);
    $sql = preg_replace(
        "/date\('now',\s*'([+-]?\d+)\s+days?'\)/i",
        'DATE_ADD(CURDATE(), INTERVAL $1 DAY)',
        $sql
    );
    $sql = preg_replace(
        "/strftime\('%Y-%m',\s*([^)]+)\)/i",
        "DATE_FORMAT($1, '%Y-%m')",
        $sql
    );
    $sql = str_ireplace('last_insert_rowid()', 'LAST_INSERT_ID()', $sql);
    return $sql;
}

if ($action === 'sql_qry') {
    $b   = getBody();
    $sql = fixSql(trim(isset($b['sql']) ? $b['sql'] : ''));
    $p   = isset($b['params']) ? $b['params'] : array();
    if (!$sql) err('SQL required.', 400);
    if (!preg_match('/^\s*SELECT\s/i', $sql)) err('sql_qry only allows SELECT.', 400);
    ok(array('rows' => dbAll($sql, $p)), 200);
}

if ($action === 'sql_run') {
    $b   = getBody();
    $sql = fixSql(trim(isset($b['sql']) ? $b['sql'] : ''));
    $p   = isset($b['params']) ? $b['params'] : array();
    $role = strtolower(trim(isset($b['role']) ? $b['role'] : ''));
    if (!$sql) err('SQL required.', 400);
    if (preg_match('/^\s*(DROP|TRUNCATE|ALTER)\s/i', $sql))
        err('Unsafe SQL blocked.', 403);
    // Block direct password writes to auth_users — use dedicated auth actions
    if (preg_match('/auth_users/i', $sql) && !preg_match('/^\s*SELECT/i', $sql))
        err('Direct writes to auth_users are blocked. Use the dedicated auth actions.', 403);
    // Role-based attendance guards:
    // Admin cannot write to member attendance table
    if ($role === 'admin' && preg_match('/\battendance\b/i', $sql) && !preg_match('/\bstaff_attendance\b/i', $sql) && !preg_match('/^\s*SELECT/i', $sql))
        err('Admins cannot modify member attendance. Only trainers can.', 403);
    // Trainer cannot write to staff_attendance table
    if ($role === 'trainer' && preg_match('/\bstaff_attendance\b/i', $sql) && !preg_match('/^\s*SELECT/i', $sql))
        err('Trainers cannot modify staff attendance. Only admins can.', 403);
    dbRun($sql, $p);
    $lastId = (int) db()->lastInsertId();
    ok(array('success' => true, 'id' => $lastId, 'rows' => array(array('id' => $lastId))), 200);
}



// ── ONE-TIME DB MIGRATION — visit once then ignore ────────────
// http://localhost/fitcore/api.php?action=migrate
if ($action === 'migrate') {
    $results = array();

    $migrations = array(
        // trainer_notes on members (for coaching dashboard)
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS trainer_notes TEXT DEFAULT NULL",
        // avatar columns on members
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_type VARCHAR(20) DEFAULT 'initials'",
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_data MEDIUMTEXT DEFAULT NULL",
        // ai_recs new columns
        "ALTER TABLE ai_recs ADD COLUMN IF NOT EXISTS age INT DEFAULT NULL",
        "ALTER TABLE ai_recs ADD COLUMN IF NOT EXISTS gender VARCHAR(20) DEFAULT ''",
        "ALTER TABLE ai_recs ADD COLUMN IF NOT EXISTS injuries TEXT",
        "ALTER TABLE ai_recs ADD COLUMN IF NOT EXISTS diet_tips TEXT",
        "ALTER TABLE ai_recs ADD COLUMN IF NOT EXISTS workout_tips TEXT",
        // member_goals table
        "CREATE TABLE IF NOT EXISTS member_goals (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            member_id     INT NOT NULL,
            goal_type     VARCHAR(50) DEFAULT 'weight',
            goal_label    VARCHAR(100) DEFAULT '',
            start_value   DECIMAL(6,2) DEFAULT NULL,
            target_value  DECIMAL(6,2) DEFAULT NULL,
            current_value DECIMAL(6,2) DEFAULT NULL,
            unit          VARCHAR(20) DEFAULT 'kg',
            notes         TEXT,
            achieved      TINYINT(1) DEFAULT 0,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )",
        // ── Performance indexes (safe to re-run — IF NOT EXISTS) ──
        // attendance: per-member date-range queries, live-now lookup, global time filter
        "CREATE INDEX IF NOT EXISTS idx_att_member_time  ON attendance (member_id, checkin_time)",
        "CREATE INDEX IF NOT EXISTS idx_att_time         ON attendance (checkin_time)",
        "CREATE INDEX IF NOT EXISTS idx_att_member_cout  ON attendance (member_id, checkout_time)",
        // members: trainer filter, status filter
        "CREATE INDEX IF NOT EXISTS idx_members_trainer  ON members (trainer_id)",
        "CREATE INDEX IF NOT EXISTS idx_members_status   ON members (status)",
        // memberships: latest-membership subquery, expiry warnings
        "CREATE INDEX IF NOT EXISTS idx_ms_member_created ON memberships (member_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_ms_status_end    ON memberships (status, end_date)",
        // payments: revenue by date, per-member history
        "CREATE INDEX IF NOT EXISTS idx_pay_date         ON payments (date)",
        "CREATE INDEX IF NOT EXISTS idx_pay_member       ON payments (member_id)",
        // ai_recs: latest rec per member
        "CREATE INDEX IF NOT EXISTS idx_airecs_member    ON ai_recs (member_id, created_at)",
        // member_goals: latest active goal per member
        "CREATE INDEX IF NOT EXISTS idx_goals_member     ON member_goals (member_id, achieved)",
        // staff_attendance: shift stats
        "CREATE INDEX IF NOT EXISTS idx_satt_staff_time  ON staff_attendance (staff_id, checkin_time)",
        // class_trainers: schedule lookup
        "CREATE INDEX IF NOT EXISTS idx_ct_staff         ON class_trainers (staff_id)",
    );

    foreach ($migrations as $sql) {
        try {
            db()->exec($sql);
            $results[] = array('sql' => substr(trim($sql), 0, 80) . '...', 'status' => 'OK');
        } catch (Exception $e) {
            $results[] = array('sql' => substr(trim($sql), 0, 80) . '...', 'status' => 'ERROR: ' . $e->getMessage());
        }
    }

    ok(array('migration' => 'complete', 'results' => $results), 200);
}

// ── SAVE AVATAR (multipart upload — bypasses post_max_size JSON limit) ────────
if ($action === 'save_avatar') {
    $mid  = isset($_POST['member_id']) ? (int)$_POST['member_id'] : 0;
    $type = isset($_POST['avatar_type']) ? $_POST['avatar_type'] : '';

    if (!$mid || !in_array($type, array('upload', 'preset'))) {
        err('Invalid avatar data.', 400);
    }

    if ($type === 'preset') {
        $key = isset($_POST['avatar_data']) ? trim($_POST['avatar_data']) : '';
        if (!$key) err('Preset key required.', 400);
        dbRun('UPDATE members SET avatar_type=?, avatar_data=? WHERE id=?', array('preset', $key, $mid));
        ok(array('success' => true), 200);
    }

    // upload type — file comes via $_FILES or base64 via $_POST
    if (isset($_FILES['avatar_file']) && $_FILES['avatar_file']['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES['avatar_file'];
        if ($file['size'] > 8 * 1024 * 1024) err('File too large — max 8MB.', 413);
        $mime = mime_content_type($file['tmp_name']);
        if (!in_array($mime, array('image/jpeg','image/png','image/gif','image/webp'))) {
            err('Invalid image type: ' . $mime, 415);
        }
        $data = base64_encode(file_get_contents($file['tmp_name']));
        $dataUri = 'data:' . $mime . ';base64,' . $data;
    } else if (isset($_POST['avatar_data']) && strpos($_POST['avatar_data'], 'data:image') === 0) {
        $dataUri = $_POST['avatar_data'];
    } else {
        err('No image data received.', 400);
    }

    // Store — use large packet session just in case
    try { db()->exec('SET SESSION max_allowed_packet = 16777216'); } catch(Exception $e) {}
    dbRun('UPDATE members SET avatar_type=?, avatar_data=? WHERE id=?', array('upload', $dataUri, $mid));
    ok(array('success' => true), 200);
}

// ── LOGIN ─────────────────────────────────────────────────────
if ($action === 'login') {
    $b  = getBody();
    $un = strtolower(trim(isset($b['username']) ? $b['username'] : ''));
    $pw = isset($b['password']) ? $b['password'] : '';
    if (!$un || !$pw) err('Username and password required.', 400);

    $u = dbOne('SELECT * FROM auth_users WHERE LOWER(username) = ? LIMIT 1', array($un));
    if (!$u) err('Invalid credentials.', 401);

    $stored = $u['password'];
    $valid  = false;

    // Accept bcrypt hash OR plain-text (for initial setup / dev convenience)
    if (substr($stored, 0, 4) === '$2y$') {
        $valid = password_verify($pw, $stored);
    } else {
        // Plain-text match — then upgrade to hash automatically
        $valid = ($pw === $stored);
        if ($valid) {
            $hash = password_hash($pw, PASSWORD_BCRYPT);
            dbRun('UPDATE auth_users SET password=? WHERE id=?',
                  array($hash, $u['id']));
        }
    }

    if (!$valid) err('Invalid credentials.', 401);

    // Fetch fname/lname from members or staff for display purposes
    $fname = ''; $lname = '';
    if ($u['member_id']) {
        $m = dbOne('SELECT fname, lname FROM members WHERE id=?', array((int)$u['member_id']));
        if ($m) { $fname = $m['fname']; $lname = $m['lname']; }
    } elseif ($u['staff_id']) {
        $s = dbOne('SELECT fname, lname FROM staff WHERE id=?', array((int)$u['staff_id']));
        if ($s) { $fname = $s['fname']; $lname = $s['lname']; }
    } else {
        // Admin — use username as display name
        $fname = ucfirst($u['username']);
    }

    ok(array(
        'id'        => (int) $u['id'],
        'username'  => $u['username'],
        'role'      => $u['role'],
        'member_id' => $u['member_id'],
        'staff_id'  => $u['staff_id'],
        'fname'     => $fname,
        'lname'     => $lname,
    ), 200);
}

// ── CHANGE PASSWORD (member self-service) ─────────────────────
if ($action === 'change_password') {
    $b   = getBody();
    $mid = isset($b['member_id']) ? (int)$b['member_id'] : 0;
    $pw  = isset($b['new_password']) ? $b['new_password'] : '';
    if (!$mid || strlen($pw) < 6) err('Invalid request.', 400);
    $hash = password_hash($pw, PASSWORD_BCRYPT);
    dbRun('UPDATE auth_users SET password=? WHERE member_id=?', array($hash, $mid));
    ok(array('success' => true), 200);
}

// ── SET STAFF PASSWORD (admin creates or updates staff login) ──
if ($action === 'set_staff_password') {
    $b      = getBody();
    $sid    = isset($b['staff_id'])    ? (int)$b['staff_id']             : 0;
    $uname  = strtolower(trim(isset($b['username'])     ? $b['username']     : ''));
    $pw     = isset($b['new_password']) ? $b['new_password']              : '';
    $role   = isset($b['role'])         ? $b['role']                      : 'trainer';
    $create = isset($b['create'])       ? (bool)$b['create']              : false;
    if (!$sid || !$uname || strlen($pw) < 6) err('Invalid request.', 400);
    $hash = password_hash($pw, PASSWORD_BCRYPT);
    if ($create) {
        dbRun('INSERT INTO auth_users(username,password,role,member_id,staff_id) VALUES(?,?,?,NULL,?)',
              array($uname, $hash, $role, $sid));
    } else {
        dbRun('UPDATE auth_users SET username=?,password=?,role=? WHERE staff_id=?',
              array($uname, $hash, $role, $sid));
    }
    ok(array('success' => true), 200);
}

// ── REGISTER ──────────────────────────────────────────────────
if ($action === 'register') {
    $b      = getBody();
    $fname  = trim(isset($b['fname'])    ? $b['fname']    : '');
    $lname  = trim(isset($b['lname'])    ? $b['lname']    : '');
    $email  = strtolower(trim(isset($b['email'])    ? $b['email']    : ''));
    $phone  = trim(isset($b['phone'])    ? $b['phone']    : '');
    $dob    = trim(isset($b['dob'])      ? $b['dob']      : '');
    $gender = trim(isset($b['gender'])   ? $b['gender']   : 'Other');
    $pw     = isset($b['password']) ? $b['password'] : '';
    $pid    = isset($b['plan_id'])  ? (int)$b['plan_id'] : 0;

    if (!$fname || !$email || !$pw)
        err('First name, email and password are required.', 400);

    if (strlen($pw) < 6)
        err('Password must be at least 6 characters.', 400);

    $exists = (int) dbVal('SELECT COUNT(*) FROM auth_users WHERE LOWER(username)=?',
                           array($email));
    if ($exists) err('This email is already registered.', 409);

    // Create member profile
    dbRun("INSERT INTO members(fname,lname,email,phone,dob,gender,status) VALUES(?,?,?,?,?,?,'active')",
          array($fname, $lname, $email, $phone, $dob ?: null, $gender));
    $mid = (int) db()->lastInsertId();

    // Create login account (bcrypt password)
    $hash = password_hash($pw, PASSWORD_BCRYPT);
    dbRun('INSERT INTO auth_users(username,password,role,member_id) VALUES(?,?,?,?)',
          array($email, $hash, 'user', $mid));
    $uid = (int) db()->lastInsertId();

    // If a plan was chosen, create a membership record
    if ($pid > 0) {
        $plan = db()->prepare('SELECT * FROM plans WHERE id=?');
        $plan->execute(array($pid));
        $p = $plan->fetch();
        if ($p) {
            $start = date('Y-m-d');
            $end   = date('Y-m-d', strtotime('+' . (int)$p['duration'] . ' days'));
            dbRun("INSERT INTO memberships(member_id,plan_id,start_date,end_date,amount,status,notes) VALUES(?,?,?,?,?,'active','Self-registered online')",
                  array($mid, $pid, $start, $end, $p['price']));
        }
    }

    ok(array('id' => $uid, 'username' => $email,
             'role' => 'user', 'member_id' => $mid), 201);
}

// ── STATS ─────────────────────────────────────────────────────
if ($action === 'stats') {
    $today      = date('Y-m-d');
    $monthStart = date('Y-m-01');

    $attChart = array();
    for ($i = 6; $i >= 0; $i--) {
        $d = date('Y-m-d', strtotime("-$i days"));
        $attChart[] = array(
            'date'  => $d,
            'count' => (int) dbVal(
                'SELECT COUNT(*) FROM attendance WHERE DATE(checkin_time)=?',
                array($d)
            )
        );
    }

    ok(array(
        'total_members'    => (int)   dbVal('SELECT COUNT(*) FROM members', array()),
        'active_members'   => (int)   dbVal("SELECT COUNT(*) FROM members WHERE status='active'", array()),
        'monthly_revenue'  => (float) dbVal('SELECT COALESCE(SUM(amount),0) FROM payments WHERE date>=?', array($monthStart)),
        'today_checkins'   => (int)   dbVal('SELECT COUNT(*) FROM attendance WHERE DATE(checkin_time)=?', array($today)),
        'active_classes'   => (int)   dbVal('SELECT COUNT(*) FROM classes', array()),
        'staff_count'      => (int)   dbVal('SELECT COUNT(*) FROM staff', array()),
        'attendance_chart' => $attChart,
    ), 200);
}

// ── GENERIC CRUD ──────────────────────────────────────────────
$TABLES = array(
    'plans'       => array('name','duration','price','category','features','description'),
    'members'     => array('fname','lname','email','phone','dob','gender','address',
                           'emergency_contact','medical_notes','status','trainer_id','trainer_notes'),
    'memberships' => array('member_id','plan_id','start_date','end_date','amount','status','notes'),
    'payments'    => array('member_id','amount','method','plan','date','note'),
    'attendance'       => array('member_id','checkin_time','checkout_time'),
    'staff_attendance' => array('staff_id','checkin_time','checkout_time','notes'),
    'classes'        => array('name','day','time','duration','capacity'),
    'class_trainers' => array('class_id','staff_id','assigned_date','notes'),
    'equipment'   => array('name','category','quantity','condition_status',
                           'purchase_date','next_maintenance','notes'),
    'staff'       => array('fname','lname','email','phone','role','hire_date','salary','schedule'),
    'ai_recs'     => array('member_id','goal','bmi','age','gender','injuries',
                           'days_per_week','experience',
                           'plan_id','plan_name','schedule',
                           'diet_tips','workout_tips','recommended_class_ids'),
    'recent_changes' => array('event_type','entity','entity_id','actor_id','title','detail'),
    'member_goals'   => array('member_id','goal_type','goal_label','start_value','target_value',
                              'current_value','unit','notes','achieved'),
);

if (in_array($action, array('get','create','update','delete'))) {
    $table = isset($_GET['table']) ? $_GET['table'] : '';
    if (!isset($TABLES[$table])) err("Unknown table: $table", 400);

    $id   = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    $cols = $TABLES[$table];

    // ── GET
    if ($action === 'get') {
        if ($table === 'memberships') {
            $mid  = isset($_GET['member_id']) ? (int)$_GET['member_id'] : 0;
            $sql  = 'SELECT ms.*, p.name AS plan_name,
                            CONCAT(m.fname," ",m.lname) AS member_name
                     FROM memberships ms
                     JOIN plans   p ON p.id = ms.plan_id
                     JOIN members m ON m.id = ms.member_id';
            $args = array();
            if ($id)      { $sql .= ' WHERE ms.id=?';        $args = array($id); }
            elseif ($mid) { $sql .= ' WHERE ms.member_id=?'; $args = array($mid); }
            $sql .= ' ORDER BY ms.created_at DESC';
            $r = $id ? dbOne($sql, $args) : dbAll($sql, $args);
            ok($r ? $r : array(), 200);
        }

        if ($table === 'attendance') {
            $sql  = 'SELECT a.*, CONCAT(m.fname," ",m.lname) AS member_name
                     FROM attendance a JOIN members m ON m.id=a.member_id';
            $args = array();
            if ($id) { $sql .= ' WHERE a.id=?'; $args = array($id); }
            $sql .= ' ORDER BY a.checkin_time DESC LIMIT 500';
            $r = $id ? dbOne($sql, $args) : dbAll($sql, $args);
            ok($r ? $r : array(), 200);
        }

        if ($table === 'staff_attendance') {
            $sql  = 'SELECT sa.*, st.fname, st.lname, st.role,
                            CONCAT(st.fname," ",st.lname) AS staff_name
                     FROM staff_attendance sa JOIN staff st ON st.id=sa.staff_id';
            $args = array();
            if ($id) { $sql .= ' WHERE sa.id=?'; $args = array($id); }
            $sql .= ' ORDER BY sa.checkin_time DESC LIMIT 500';
            $r = $id ? dbOne($sql, $args) : dbAll($sql, $args);
            ok($r ? $r : array(), 200);
        }

        if ($table === 'payments') {
            $sql  = 'SELECT p.*, CONCAT(m.fname," ",m.lname) AS member_name
                     FROM payments p JOIN members m ON m.id=p.member_id';
            $args = array();
            if ($id) { $sql .= ' WHERE p.id=?'; $args = array($id); }
            $sql .= ' ORDER BY p.created_at DESC';
            $r = $id ? dbOne($sql, $args) : dbAll($sql, $args);
            ok($r ? $r : array(), 200);
        }

        // ── classes: select with assigned trainer name from class_trainers
        if ($table === 'classes') {
            $sql  = "SELECT c.*,
                            CONCAT(s.fname,' ',s.lname) AS trainer_name,
                            s.id AS trainer_staff_id
                     FROM classes c
                     LEFT JOIN class_trainers ct ON ct.class_id = c.id
                     LEFT JOIN staff s ON s.id = ct.staff_id";
            $args = array();
            if ($id) { $sql .= ' WHERE c.id=?'; $args = array($id); }
            $sql .= " ORDER BY CASE c.day
                        WHEN 'Monday'    THEN 1 WHEN 'Tuesday'   THEN 2
                        WHEN 'Wednesday' THEN 3 WHEN 'Thursday'  THEN 4
                        WHEN 'Friday'    THEN 5 WHEN 'Saturday'  THEN 6
                        ELSE 7 END, c.time";
            $r = $id ? dbOne($sql, $args) : dbAll($sql, $args);
            ok($r ? $r : array(), 200);
        }

        // ── class_trainers: include class name and staff name
        if ($table === 'class_trainers') {
            $cid = isset($_GET['class_id']) ? (int)$_GET['class_id'] : 0;
            $sql = 'SELECT ct.*, c.name AS class_name,
                           CONCAT(s.fname," ",s.lname) AS staff_name, s.role AS staff_role
                    FROM class_trainers ct
                    JOIN classes c ON c.id = ct.class_id
                    JOIN staff   s ON s.id = ct.staff_id';
            $args = array();
            if ($id)  { $sql .= ' WHERE ct.id=?';       $args = array($id); }
            elseif ($cid) { $sql .= ' WHERE ct.class_id=?'; $args = array($cid); }
            $sql .= ' ORDER BY ct.created_at DESC';
            $r = $id ? dbOne($sql, $args) : dbAll($sql, $args);
            ok($r ? $r : array(), 200);
        }

        if ($id) {
            $r = dbOne("SELECT * FROM `$table` WHERE id=?", array($id));
            ok($r ? $r : array(), 200);
        }

        $search = trim(isset($_GET['search']) ? $_GET['search'] : '');
        if ($search) {
            $searchable = array('name','fname','lname','email','phone',
                                'role','category');
            $sCols = array();
            foreach ($cols as $c) {
                if (in_array($c, $searchable)) $sCols[] = $c;
            }
            if ($sCols) {
                $like  = "%$search%";
                $parts = array();
                foreach ($sCols as $c) $parts[] = "`$c` LIKE ?";
                $where = implode(' OR ', $parts);
                $args  = array_fill(0, count($sCols), $like);
                ok(dbAll("SELECT * FROM `$table` WHERE $where ORDER BY id DESC", $args), 200);
            }
        }
        ok(dbAll("SELECT * FROM `$table` ORDER BY id DESC", array()), 200);
    }

    // ── CREATE
    if ($action === 'create') {
        $b    = getBody();
        $keys = array();
        foreach ($cols as $c) { if (array_key_exists($c, $b)) $keys[] = $c; }
        if (empty($keys)) err('No valid fields provided.', 400);
        $parts = array();
        foreach ($keys as $k) $parts[] = "`$k`=?";
        $set  = implode(',', $parts);
        $vals = array();
        foreach ($keys as $k) $vals[] = ($b[$k] === '') ? null : $b[$k];
        dbRun("INSERT INTO `$table` SET $set", $vals);
        ok(array('success' => true, 'id' => (int) db()->lastInsertId()), 201);
    }

    // ── UPDATE
    if ($action === 'update') {
        if (!$id) err('ID required.', 400);
        $b    = getBody();
        $keys = array();
        foreach ($cols as $c) { if (array_key_exists($c, $b)) $keys[] = $c; }
        if (empty($keys)) err('No valid fields provided.', 400);
        $parts = array();
        foreach ($keys as $k) $parts[] = "`$k`=?";
        $set  = implode(',', $parts);
        $vals = array();
        foreach ($keys as $k) $vals[] = ($b[$k] === '') ? null : $b[$k];
        $vals[] = $id;
        dbRun("UPDATE `$table` SET $set WHERE id=?", $vals);
        ok(array('success' => true), 200);
    }

    // ── DELETE
    if ($action === 'delete') {
        if (!$id) err('ID required.', 400);
        dbRun("DELETE FROM `$table` WHERE id=?", array($id));
        ok(array('success' => true), 200);
    }
}

// ── PEAK DASHBOARD ────────────────────────────────────────────
if ($action === 'peak_dashboard') {
    // Fetch all classes with trainer name
    $classes = dbAll("
        SELECT c.id, c.name, c.day, c.time, c.duration, c.capacity,
               CONCAT(s.fname,' ',s.lname) AS trainer_name,
               s.id AS trainer_id
        FROM classes c
        LEFT JOIN class_trainers ct ON ct.class_id = c.id
        LEFT JOIN staff s ON s.id = ct.staff_id
        ORDER BY CASE c.day
            WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
            WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6
            ELSE 7 END, c.time
    ", array());

    // Try to add enrollment counts — table may not exist yet
    $hasEnrollments = false;
    try {
        $chk = dbVal("SELECT COUNT(*) FROM information_schema.tables
                      WHERE table_schema=DATABASE() AND table_name='class_enrollments'", array());
        $hasEnrollments = (int)$chk > 0;
    } catch (Exception $e) {}

    foreach ($classes as &$cls) {
        if ($hasEnrollments) {
            $confirmed  = (int)dbVal(
                "SELECT COUNT(*) FROM class_enrollments WHERE class_id=? AND status='confirmed'",
                array($cls['id']));
            $waitlisted = (int)dbVal(
                "SELECT COUNT(*) FROM class_enrollments WHERE class_id=? AND status='waitlisted'",
                array($cls['id']));
        } else {
            $confirmed  = 0;
            $waitlisted = 0;
        }
        $cls['confirmed']   = $confirmed;
        $cls['waitlisted']  = $waitlisted;
        $cls['fill_pct']    = $cls['capacity'] > 0
            ? (int)round($confirmed / $cls['capacity'] * 100)
            : 0;
    }
    unset($cls);

    ok(array('all_classes' => $classes), 200);
}

// ── ASSIGN CLASS TRAINER ──────────────────────────────────────
if ($action === 'assign_class_trainer') {
    $b        = getBody();
    $classId  = isset($b['class_id'])  ? (int)$b['class_id']  : 0;
    $staffId  = isset($b['staff_id'])  ? (int)$b['staff_id']  : 0;
    if (!$classId || !$staffId) err('class_id and staff_id required.', 400);

    dbRun('DELETE FROM class_trainers WHERE class_id=?', array($classId));
    dbRun('INSERT INTO class_trainers (class_id, staff_id, assigned_date)
           VALUES (?, ?, CURDATE())', array($classId, $staffId));

    ok(array('success' => true), 200);
}

// ── BOOK CLASS (member self-enroll) ───────────────────────────
if ($action === 'book_class') {
    $b        = getBody();
    $classId  = isset($b['class_id'])  ? (int)$b['class_id']  : 0;
    $memberId = isset($b['member_id']) ? (int)$b['member_id'] : 0;
    if (!$classId || !$memberId) err('class_id and member_id required.', 400);

    // Already booked?
    $existing = dbVal('SELECT status FROM class_enrollments WHERE class_id=? AND member_id=?',
                      array($classId, $memberId));
    if ($existing) ok(array('status' => $existing, 'already' => true), 200);

    // Check capacity
    $capacity  = (int)dbVal('SELECT capacity FROM classes WHERE id=?', array($classId));
    $confirmed = (int)dbVal("SELECT COUNT(*) FROM class_enrollments WHERE class_id=? AND status='confirmed'",
                             array($classId));

    $status = ($capacity > 0 && $confirmed >= $capacity) ? 'waitlisted' : 'confirmed';

    dbRun('INSERT INTO class_enrollments (class_id, member_id, status, enrolled_at)
           VALUES (?, ?, ?, NOW())',
          array($classId, $memberId, $status));

    ok(array('status' => $status, 'already' => false), 200);
}

// ── CANCEL BOOKING ────────────────────────────────────────────
if ($action === 'cancel_booking') {
    $b        = getBody();
    $classId  = isset($b['class_id'])  ? (int)$b['class_id']  : 0;
    $memberId = isset($b['member_id']) ? (int)$b['member_id'] : 0;
    if (!$classId || !$memberId) err('class_id and member_id required.', 400);

    dbRun('DELETE FROM class_enrollments WHERE class_id=? AND member_id=?',
          array($classId, $memberId));

    // Auto-promote first waitlisted member if a confirmed spot just freed up
    $capacity  = (int)dbVal('SELECT capacity FROM classes WHERE id=?', array($classId));
    $confirmed = (int)dbVal("SELECT COUNT(*) FROM class_enrollments WHERE class_id=? AND status='confirmed'",
                             array($classId));
    if ($confirmed < $capacity) {
        $next = dbVal("SELECT id FROM class_enrollments WHERE class_id=? AND status='waitlisted'
                       ORDER BY enrolled_at ASC LIMIT 1", array($classId));
        if ($next) {
            dbRun("UPDATE class_enrollments SET status='confirmed' WHERE id=?", array($next));
        }
    }

    ok(array('success' => true), 200);
}

// ── GET ENROLLMENTS FOR A CLASS (admin view) ──────────────────
if ($action === 'get_enrollments') {
    $classId = isset($_GET['class_id']) ? (int)$_GET['class_id'] : 0;
    if (!$classId) err('class_id required.', 400);

    $rows = dbAll(
        "SELECT ce.id, ce.member_id, ce.status, ce.enrolled_at,
                CONCAT(m.fname,' ',m.lname) AS member_name,
                m.phone, m.email
         FROM class_enrollments ce
         JOIN members m ON m.id = ce.member_id
         WHERE ce.class_id = ?
         ORDER BY ce.status DESC, ce.enrolled_at ASC",
        array($classId)
    );
    ok(array('enrollments' => $rows), 200);
}

err("Unknown action: $action", 404);