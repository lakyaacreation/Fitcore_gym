# 🏋️ FitCore — Web-Based Gym Management System

> **BSc Software Engineering Dissertation Project**
> Cardiff Metropolitan University × ICBT Campus
> Submitted March 2026 — Rajhalakyaa Mahendrarajah

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [System Diagrams](#system-diagrams)
- [Screenshots](#screenshots)
- [Getting Started](#getting-started)
- [Default Login Credentials](#default-login-credentials)
- [API Reference](#api-reference)
- [Role-Based Access Control](#role-based-access-control)
- [Security Notes](#security-notes)
- [Author](#author)

---

## Overview

FitCore is a full-stack, single-page web application (SPA) built to digitise and streamline gym operations. It was developed as a dissertation project to replace manual, disconnected processes — paper attendance logs, spreadsheet member records, and unlinked payment tracking — with a unified, role-aware management system.

The system supports three user roles (**Admin**, **Trainer**, **Member**), each with a tailored dashboard and strictly enforced permissions at both the UI and API layer.

---

## Features

### 👤 Admin
| Module | Capabilities |
|--------|-------------|
| Dashboard | Live KPIs (members, revenue, check-ins, classes, staff), 7-day attendance chart, expiring memberships alert, recent activity feed |
| Members | Full CRUD, trainer assignment, avatar upload, coaching notes |
| Memberships | Assign plans to members, track start/end dates and status |
| Plans | Create and manage membership plans with pricing and features |
| Payments | Record cash/card payments, full payment history |
| Attendance | Member and staff check-in/check-out with timestamps |
| Classes | Create weekly class schedule, assign trainers, view peak capacity dashboard |
| Equipment | Inventory tracking with condition status and maintenance dates |
| Staff | Full CRUD, login account provisioning, schedule management |
| Announcements | Post notifications visible to members and trainers on login |

### 🏋️ Trainer
| Module | Capabilities |
|--------|-------------|
| Dashboard | Today's classes, assigned members, coaching overview |
| Members | View and add coaching notes for assigned members |
| Attendance | Check in/out assigned members, take class attendance in bulk |
| Classes | View schedule, see class rosters |
| Goal Tracking | Set and track fitness goals for assigned members |
| My Shift | Clock in/clock out, view shift history and stats |
| AI | Generate personalised workout and diet recommendations |

### 👥 Member
| Module | Capabilities |
|--------|-------------|
| Dashboard | Membership status, upcoming classes, goal progress ring |
| My Profile | Edit personal details, change password, upload avatar |
| Attendance | Self check-in/check-out, attendance history and calendar |
| Classes | View full schedule, self-book classes, cancel bookings, waitlist |
| Payments | View payment history, pay by card (simulated) |
| AI | Generate personalised workout plans and diet guidance |
| Goals | Set weight loss/gain goals, log progress, weight chart |

### 🤖 AI Recommendation Engine
- Rule-based expert system using: fitness goal, BMI, age, gender, training days/week, experience level, injury history
- Generates: personalised weekly workout schedule + macronutrient diet guidance + recommended membership plan
- All recommendations persisted to `ai_recs` table for history tracking
- Powered by **Claude AI (Anthropic API)** with local rule-engine fallback

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Structure | HTML5 | 5 |
| Frontend Styling | CSS3 (custom properties, flex/grid) | 3 |
| Frontend Logic | Vanilla JavaScript ES2020 (SPA) | ES2020 |
| HTTP Client | Fetch API (native) | Native |
| Backend API | PHP | 7.2+ |
| Database | MySQL | 5.7+ |
| Dev Environment | XAMPP | 8.x |
| Password Hashing | bcrypt (`PASSWORD_BCRYPT`) | PHP built-in |
| AI Engine | Claude API (Anthropic) + rule engine | — |

**No frontend framework. No npm dependencies. No build step required.**

---


---

## Project Structure

```
fitcore/
│
├── index.html               # SPA shell — all pages rendered here
├── styles.css               # Full UI stylesheet (dark theme, CSS variables)
├── app.js                   # SPA router, RBAC module, auth, core UI functions
├── api-client.js            # Async MySQL API client — overrides app.js stubs
│
├── api.php                  # Single-file RESTful PHP backend (20 action routes)
├── fitcore_db.sql           # Full MySQL schema + seed data (15 tables, indexes)
│
├── test.php                 # Login diagnostic — DB connection, hash verification, auto-fix
├── index.php                # Apache redirect helper
│
└── docs/
    ├── diagrams/            # All 18 Mermaid diagram exports (PNG)
    └── screenshots/         # All 32 system screenshots
```

> **~32,000 lines of code** across 6 source files.

---

## Database Schema

15 tables, all in Third Normal Form (3NF), with foreign key constraints and performance indexes.

| Table | Purpose |
|-------|---------|
| `members` | Member profiles, trainer assignment, avatar |
| `plans` | Membership plan catalogue |
| `memberships` | Member ↔ plan assignments with dates and status |
| `payments` | Payment transaction records |
| `attendance` | Member check-in/check-out log |
| `classes` | Fitness class schedule |
| `class_trainers` | Trainer assigned to each class |
| `class_enrollments` | Member class bookings (confirmed / waitlisted) |
| `staff` | Staff and trainer records |
| `staff_attendance` | Trainer shift clock-in/clock-out |
| `equipment` | Equipment inventory |
| `auth_users` | Login accounts (bcrypt passwords) |
| `ai_recs` | AI recommendation history |
| `member_goals` | Member fitness goal tracking |
| `recent_changes` | Admin activity feed |

---

## System Diagrams

### 1. System Architecture

![System Architecture Diagram](docs/diagrams/01_system_architecture.png)

---

### 2. Use Case Diagram

![Use Case Diagram](docs/diagrams/02_use_case.png)

---

### 3. Entity-Relationship (ER) Diagram

![ER Diagram](docs/diagrams/03_er_diagram.png)

---

### 4. Class Diagram

![Class Diagram](docs/diagrams/04_class_diagram.png)

---

### 5. Sequence Diagrams

#### 5.1 Login Authentication Flow

![Login Sequence Diagram](docs/diagrams/05_seq_login.png)

---

#### 5.2 Member Registration Flow

![Member Registration Sequence Diagram](docs/diagrams/06_seq_register.png)

---

#### 5.3 Member Attendance Check-in / Check-out Flow

![Attendance Sequence Diagram](docs/diagrams/07_seq_attendance.png)

---

#### 5.4 Process Payment Flow

![Payment Sequence Diagram](docs/diagrams/08_seq_payment.png)

---

#### 5.5 Credit Card Payment (Member) Flow

![Card Payment Sequence Diagram](docs/diagrams/09_seq_card_payment.png)

---

#### 5.6 AI Recommendation Generation Flow

![AI Recommendation Sequence Diagram](docs/diagrams/10_seq_ai.png)

---

#### 5.7 Assign Trainer to Class Flow

![Assign Trainer Sequence Diagram](docs/diagrams/11_seq_assign_trainer.png)

---

#### 5.8 Peak Dashboard Load Flow

![Peak Dashboard Sequence Diagram](docs/diagrams/12_seq_peak_dashboard.png)

---

#### 5.9 Trainer Shift Clock-In / Clock-Out Flow

![Trainer Shift Sequence Diagram](docs/diagrams/13_seq_trainer_shift.png)

---

#### 5.10 Trainer Take Class Attendance Flow

![Class Attendance Sequence Diagram](docs/diagrams/14_seq_class_attendance.png)

---

#### 5.11 Login Notifications Flow

![Login Notifications Sequence Diagram](docs/diagrams/15_seq_notifications.png)

---

#### 5.12 Member Goal Tracking Flow

![Goal Tracking Sequence Diagram](docs/diagrams/16_seq_goal_tracking.png)

---

#### 5.13 Staff Management & Login Provisioning Flow

![Staff Provisioning Sequence Diagram](docs/diagrams/17_seq_staff_provisioning.png)

---

#### 5.14 Avatar Upload Flow

![Avatar Upload Sequence Diagram](docs/diagrams/18_seq_avatar_upload.png)

---

## Screenshots

### Login
![Login](docs/screenshots/01_login.png)

---

### 👤 Admin — Dashboard
![Admin Dashboard](docs/screenshots/02_admin_dashboard.png)

---

### 👤 Admin — Peak Capacity Dashboard
![Peak Capacity](docs/screenshots/03_peak_capacity.png)

---

### 👤 Admin — Members
![Admin Members](docs/screenshots/04_admin_members.png)

---

### 👤 Admin — Memberships
![Admin Memberships](docs/screenshots/05_admin_memberships.png)

---

### 👤 Admin — Plans
![Admin Plans](docs/screenshots/06_admin_plans.png)

---

### 👤 Admin — Payments
![Admin Payments](docs/screenshots/07_admin_payments.png)

---

### 👤 Admin — Attendance (Weekly Overview)
![Admin Attendance Overview](docs/screenshots/08_admin_attendance_overview.png)

---

### 👤 Admin — Attendance (Staff)
![Admin Staff Attendance](docs/screenshots/09_admin_staff_attendance.png)

---

### 👤 Admin — Classes (Weekly Schedule)
![Admin Classes Schedule](docs/screenshots/10_admin_classes_schedule.png)

---

### 👤 Admin — Classes (Trainer Assignments)
![Admin Trainer Assignments](docs/screenshots/11_admin_trainer_assignments.png)

---

### 👤 Admin — Classes (Trainer Schedule)
![Admin Trainer Schedule](docs/screenshots/12_admin_trainer_schedule.png)

---

### 👤 Admin — Equipment
![Admin Equipment](docs/screenshots/13_admin_equipment.png)

---

### 👤 Admin — Staff
![Admin Staff](docs/screenshots/14_admin_staff.png)

---

### 🏋️ Trainer — Dashboard Overview
![Trainer Dashboard](docs/screenshots/15_trainer_dashboard.png)

---

### 🏋️ Trainer — My Members
![Trainer My Members](docs/screenshots/16_trainer_my_members.png)

---

### 🏋️ Trainer — Member Goals
![Trainer Member Goals](docs/screenshots/17_trainer_member_goals.png)

---

### 🏋️ Trainer — Quick Check-In
![Trainer Quick Checkin](docs/screenshots/18_trainer_quick_checkin.png)

---

### 🏋️ Trainer — Class Roster
![Trainer Class Roster](docs/screenshots/19_trainer_class_roster.png)

---

### 🏋️ Trainer — My Shifts
![Trainer My Shifts](docs/screenshots/20_trainer_my_shifts.png)

---

### 🏋️ Trainer — Attendance
![Trainer Attendance](docs/screenshots/21_trainer_attendance.png)

---

### 🏋️ Trainer — Classes
![Trainer Classes](docs/screenshots/22_trainer_classes.png)

---

### 🏋️ Trainer — Members
![Trainer Members](docs/screenshots/23_trainer_members.png)

---

### 👥 Member — Dashboard
![Member Dashboard](docs/screenshots/24_member_dashboard.png)

---

### 👥 Member — Attendance
![Member Attendance](docs/screenshots/25_member_attendance.png)

---

### 👥 Member — Classes
![Member Classes](docs/screenshots/26_member_classes.png)

---

### 👥 Member — Payments
![Member Payments](docs/screenshots/27_member_payments.png)

---

### 👥 Member — AI Recommendations
![Member AI](docs/screenshots/28_member_ai.png)

---

### 👥 Member — My Profile (Personal Info)
![Member Profile](docs/screenshots/29_member_profile.png)

---

### 👥 Member — My Profile (Progress)
![Member Progress](docs/screenshots/30_member_progress.png)

---

### 👥 Member — My Profile (Payment History)
![Member Payment History](docs/screenshots/31_member_payment_history.png)

---

### 👥 Member — My Profile (Security)
![Member Security](docs/screenshots/32_member_security.png)

---

## Getting Started

### Prerequisites
- [XAMPP](https://www.apachefriends.org/) (Apache + MySQL + PHP 7.2+)
- A modern browser (Chrome, Firefox, or Edge)

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/lakyaacreation/Fitcore_gym.git
```

**2. Place files in XAMPP**
```
Copy the fitcore/ folder into:
  Windows:  C:\xampp\htdocs\fitcore\
  macOS:    /Applications/XAMPP/htdocs/fitcore/
```

**3. Start XAMPP**
- Open XAMPP Control Panel
- Start **Apache** and **MySQL**

**4. Import the database**
- Open [http://localhost/phpmyadmin](http://localhost/phpmyadmin)
- Create a new database named `fitcore_db`
- Click **Import** → select `fitcore_db.sql` → click **Go**

**5. Run the diagnostic (optional but recommended)**
```
http://localhost/fitcore/test.php
```
This verifies your PHP version, database connection, table integrity, and password hashes. If any passwords show as plain-text, click **Run Auto-Fix**.

**6. Open the application**
```
http://localhost/fitcore/index.html
```

### Configuration

If your MySQL uses a different username or password, edit the constants at the top of `api.php`:

```php
define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_USER', 'root');   // ← change if needed
define('DB_PASS', '');       // ← change if needed
define('DB_NAME', 'fitcore_db');
```

Also update the API base URL in `api-client.js` if your folder name differs:

```javascript
const API = 'http://localhost/fitcore/api.php';
```

### Run Database Migrations (first time only)

After importing the SQL, visit this URL once to create indexes and any missing columns:
```
http://localhost/fitcore/api.php?action=migrate
```

---

## Default Login Credentials

> ⚠️ **These are development/demo credentials. Change them before any production deployment.**

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `admin123` |
| Trainer | `nuwan.perera` | `nuwan123` |
| Trainer | `priya.rajapaksa` | `priya123` |
| Member | `ravindu.karunanayake` | `ravindu101` |
| Member | `thisuri.marasinghe` | `thisuri102` |

The database is seeded with **160+ members**, **45+ trainers**, full attendance history, payments, and class schedules for realistic demo data.

---

## API Reference

All requests go to `api.php` using the `?action=` query parameter.

### Authentication

| Action | Method | Description |
|--------|--------|-------------|
| `login` | POST | Authenticate user, returns role + profile info |
| `register` | POST | Self-register new member with optional plan |
| `change_password` | POST | Member changes own password |
| `set_staff_password` | POST | Admin creates/updates staff login |

### Data CRUD (Generic)

| Action | Method | Description |
|--------|--------|-------------|
| `get` | GET | Fetch one or all rows from a table (`?table=members`) |
| `create` | POST | Insert a new row |
| `update` | POST | Update a row by ID |
| `delete` | GET | Delete a row by ID |

**Supported tables:** `plans`, `members`, `memberships`, `payments`, `attendance`, `staff_attendance`, `classes`, `class_trainers`, `equipment`, `staff`, `ai_recs`, `recent_changes`, `member_goals`

### Specialised Actions

| Action | Method | Description |
|--------|--------|-------------|
| `stats` | GET | Admin dashboard KPIs + 7-day attendance chart |
| `peak_dashboard` | GET | All classes with enrollment counts and fill % |
| `book_class` | POST | Member books a class (confirmed or waitlisted) |
| `cancel_booking` | POST | Member cancels booking, auto-promotes waitlist |
| `get_enrollments` | GET | Admin views all enrollments for a class |
| `assign_class_trainer` | POST | Admin assigns a trainer to a class |
| `save_avatar` | POST | Upload or select preset member avatar |
| `sql_qry` | POST | Parameterised SELECT proxy (SELECT only) |
| `sql_run` | POST | Parameterised INSERT/UPDATE/DELETE proxy (guarded) |
| `migrate` | GET | One-time schema migration and index creation |
| `ping` | GET | Health check — returns PHP version and DB name |

### Security Guards on `sql_run`

- `DROP`, `TRUNCATE`, `ALTER` — **blocked entirely**
- Direct writes to `auth_users` — **blocked** (use dedicated auth actions)
- Admin writing to `attendance` — **blocked** (trainer operation only)
- Trainer writing to `staff_attendance` — **blocked** (admin operation only)

---

## Role-Based Access Control

RBAC is enforced at **two independent layers** (defence in depth):

**Layer 1 — PHP API (`api.php`)**
Role-based SQL guards block unauthorised data writes regardless of how the API is called.

**Layer 2 — JavaScript UI (`app.js`)**
The `RBAC` constant defines permitted pages and actions per role. `applyRBAC()` runs after every login and page switch, hiding navigation items and disabling action buttons.

| Module | Admin | Trainer | Member |
|--------|-------|---------|--------|
| Dashboard | ✅ | ✅ | ✅ |
| Members (CRUD) | ✅ | 👁️ View + Notes | ❌ |
| Memberships | ✅ | ❌ | ❌ |
| Payments | ✅ | ❌ | ✅ Own only |
| Attendance | ✅ | ✅ Members only | ✅ Self only |
| Classes | ✅ Full CRUD | 👁️ View + Attend | ✅ Book/Cancel |
| Equipment | ✅ | ❌ | ❌ |
| Staff | ✅ | ❌ | ❌ |
| Plans | ✅ | ❌ | ❌ |
| AI | ❌ | ❌ | ✅ |
| My Profile | ❌ | ❌ | ✅ |

---

## Security Notes

- All passwords stored as **bcrypt hashes** (`PASSWORD_BCRYPT`, cost factor 10)
- Plain-text passwords (initial setup) are **automatically upgraded** to bcrypt on first successful login
- All database queries use **PDO prepared statements** — SQL injection protected
- Dangerous SQL operations (`DROP`, `TRUNCATE`, `ALTER`) are **blocked at the API layer**
- RBAC enforced at both **frontend (JS)** and **backend (PHP)** independently

---

## Author

**Rajhalakyaa Mahendrarajah**
BSc Software Engineering — Cardiff Metropolitan University × ICBT Campus
Student ID: St20343574

---

## Acknowledgements

Developed as a final-year dissertation project under the supervision of academic staff at Cardiff Metropolitan University and ICBT Campus. Requirements gathered through interviews and questionnaires with gym management staff and members at a local fitness centre.

---

*FitCore is a dissertation/academic project. It is not intended for production deployment without additional security hardening (HTTPS, input sanitisation review, rate limiting).*
