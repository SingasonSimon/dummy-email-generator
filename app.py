# app.py
from flask import Flask, render_template, jsonify, request
import uuid
import datetime
import random
import string
import psycopg2 
import psycopg2.extras 
import os 

app = Flask(__name__)

DATABASE_URL = os.environ.get('DATABASE_URL')
EMAIL_DOMAIN = "gmail.com" 
EMAILS_PER_PAGE = 10 

# --- Database Initialization and Helper Functions ---
def get_db_connection():
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL environment variable is not set.")
    conn = psycopg2.connect(DATABASE_URL)
    return conn

def init_db(force_create=False):
    conn = None 
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS generated_emails (
                email_address TEXT PRIMARY KEY,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        print("Ensured 'generated_emails' table exists.")
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS received_emails (
                id UUID PRIMARY KEY,
                email_address TEXT NOT NULL REFERENCES generated_emails(email_address) ON DELETE CASCADE,
                sender TEXT,
                subject TEXT,
                body TEXT,
                timestamp TIMESTAMPTZ, 
                received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP 
            )
        ''')
        print("Ensured 'received_emails' table exists.")
        conn.commit()
        print("Database tables ensured/created.")
    except Exception as e:
        print(f"Error during database initialization: {e}")
        if conn:
            conn.rollback() 
    finally:
        if conn:
            cursor.close()
            conn.close()

# --- Helper function to generate random strings ---
def generate_random_string(length=8):
    characters = string.ascii_lowercase + string.digits
    return ''.join(random.choice(characters) for i in range(length))

# --- Route for the main page ---
@app.route('/')
def index():
    return render_template('index.html')

# --- API Endpoint to generate a new email address ---
@app.route('/api/generate-email', methods=['POST'])
def api_generate_email():
    # ... (This function remains the same as in flask_app_python_neon_postgres)
    data = request.get_json()
    custom_prefix = data.get('prefix', '').strip().lower()
    sanitized_prefix = "".join(c for c in custom_prefix if c.isalnum() or c == '.')
    if sanitized_prefix.startswith('.') or sanitized_prefix.endswith('.'):
        sanitized_prefix = sanitized_prefix.strip('.')
    if '..' in sanitized_prefix: 
        sanitized_prefix = sanitized_prefix.replace('..', '.')
    conn = None
    new_email_address = None
    success_flag = False
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        while True: 
            if not sanitized_prefix:
                prefix = generate_random_string()
            else:
                if '.' not in sanitized_prefix:
                    prefix = f"{sanitized_prefix}.{generate_random_string(4)}"
                else:
                    prefix_to_check = f"{sanitized_prefix}@{EMAIL_DOMAIN}"
                    cursor.execute("SELECT 1 FROM generated_emails WHERE email_address = %s", (prefix_to_check,))
                    if cursor.fetchone():
                        prefix = f"{sanitized_prefix}.{generate_random_string(4)}"
                    else:
                        prefix = sanitized_prefix
            new_email_address = f"{prefix}@{EMAIL_DOMAIN}"
            cursor.execute("SELECT 1 FROM generated_emails WHERE email_address = %s", (new_email_address,))
            if not cursor.fetchone():
                break
            else:
                if sanitized_prefix == prefix: 
                    sanitized_prefix = prefix 
                else: 
                     sanitized_prefix = "" 
        cursor.execute("INSERT INTO generated_emails (email_address) VALUES (%s)", (new_email_address,))
        conn.commit()
        print(f"Generated and stored email: {new_email_address}")
        success_flag = True
    except psycopg2.Error as e: 
        print(f"Database error generating email: {e}")
        if conn: conn.rollback()
        new_email_address = None
    except Exception as e:
        print(f"General error generating email: {e}")
        if conn: conn.rollback()
        new_email_address = None
    finally:
        if conn:
            cursor.close()
            conn.close()
    if success_flag and new_email_address:
        return jsonify({"email": new_email_address, "success": True})
    else:
        return jsonify({"email": None, "success": False, "message": "Failed to generate a unique email address."}), 500

# --- API Endpoint to get emails for a specific address (with pagination) ---
@app.route('/api/emails/<path:email_address>', methods=['GET'])
def api_get_emails(email_address):
    # ... (This function remains the same as in flask_app_python_neon_postgres)
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', EMAILS_PER_PAGE))
    except ValueError:
        page = 1
        limit = EMAILS_PER_PAGE
    offset = (page - 1) * limit
    conn = None
    emails_data = []
    total_emails = 0
    has_more = False
    success_flag = False
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor) 
        cursor.execute("SELECT 1 FROM generated_emails WHERE email_address = %s", (email_address,))
        if not cursor.fetchone():
            return jsonify({"emails": [], "success": False, "has_more": False, "message": "This email address is not managed by this server."}), 404
        cursor.execute("SELECT COUNT(id) FROM received_emails WHERE email_address = %s", (email_address,))
        total_emails_result = cursor.fetchone()
        if total_emails_result: total_emails = total_emails_result[0]
        cursor.execute("""
            SELECT id, sender, subject, body, timestamp 
            FROM received_emails 
            WHERE email_address = %s 
            ORDER BY received_at DESC
            LIMIT %s OFFSET %s
        """, (email_address, limit, offset))
        emails_data = [dict(row) for row in cursor.fetchall()]
        success_flag = True
        has_more = (page * limit) < total_emails
        print(f"Fetched page {page} ({len(emails_data)} emails) for {email_address}. Has more: {has_more}")
    except psycopg2.Error as e:
        print(f"Database error fetching emails: {e}")
    except Exception as e:
        print(f"General error fetching emails: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
    return jsonify({"emails": emails_data, "success": success_flag, "has_more": has_more, "page": page, "total_emails": total_emails})

# --- API Endpoint to delete a single email message ---
@app.route('/api/email/<email_id_str>', methods=['DELETE'])
def api_delete_email(email_id_str):
    conn = None
    success_flag = False
    message = "Error deleting email."
    status_code = 500
    try:
        email_id_obj = uuid.UUID(email_id_str) # Convert string to UUID object for validation
        email_id_param = str(email_id_obj) # Use string representation for query
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT 1 FROM received_emails WHERE id = %s", (email_id_param,)) # Query with string
        email_exists = cursor.fetchone()
        if not email_exists:
            message = "Email not found."
            status_code = 404
        else:
            cursor.execute("DELETE FROM received_emails WHERE id = %s", (email_id_param,)) # Query with string
            conn.commit()
            
            if cursor.rowcount > 0:
                print(f"Deleted email with ID: {email_id_str}")
                message = "Email deleted successfully."
                success_flag = True
                status_code = 200
            else:
                message = "Email not found or already deleted." 
                status_code = 404
    except ValueError: 
        message = "Invalid email ID format."
        status_code = 400
    except psycopg2.Error as e:
        if conn: conn.rollback()
        print(f"Database error deleting email {email_id_str}: {e}")
    except Exception as e:
        if conn: conn.rollback()
        print(f"General error deleting email {email_id_str}: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
    return jsonify({"success": success_flag, "message": message}), status_code

# --- API Endpoint to clear all emails for a specific address ---
@app.route('/api/emails/<path:email_address>/clear', methods=['DELETE'])
def api_clear_inbox(email_address):
    # ... (This function remains the same as in flask_app_python_neon_postgres)
    conn = None
    success_flag = False
    message = "Error clearing inbox."
    deleted_count = 0
    status_code = 500
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM generated_emails WHERE email_address = %s", (email_address,))
        if not cursor.fetchone():
            message = "Email address not managed by this server."
            status_code = 404
        else:
            cursor.execute("DELETE FROM received_emails WHERE email_address = %s", (email_address,))
            deleted_count = cursor.rowcount 
            conn.commit()
            print(f"Cleared inbox for: {email_address}. Emails deleted: {deleted_count}")
            message = f"All emails for {email_address} cleared."
            success_flag = True
            status_code = 200
    except psycopg2.Error as e:
        if conn: conn.rollback()
        print(f"Database error clearing inbox for {email_address}: {e}")
    except Exception as e:
        if conn: conn.rollback()
        print(f"General error clearing inbox for {email_address}: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
    return jsonify({"success": success_flag, "message": message, "deleted_count": deleted_count}), status_code


# --- (For Testing Only) API Endpoint to simulate receiving an email ---
@app.route('/api/simulate-receive-email', methods=['POST'])
def api_simulate_receive_email():
    data = request.get_json()
    to_address = data.get('to_address')
    sender = data.get('from', 'test-sender@example.com')
    subject = data.get('subject', 'Test Email Subject')
    body = data.get('body', 'This is the body of the test email.')

    if not to_address:
        return jsonify({"success": False, "message": "Missing 'to_address'."}), 400

    conn = None
    success_flag = False
    message = "Failed to store email."
    status_code = 500
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT 1 FROM generated_emails WHERE email_address = %s", (to_address,))
        if not cursor.fetchone():
            message = f"Email address {to_address} was not generated by this server."
            status_code = 404
            print(f"Attempted to send simulated email to non-managed address: {to_address}")
        else:
            email_id_obj = uuid.uuid4() # Generate a UUID object
            email_id_param = str(email_id_obj) # Convert to string for DB query parameter

            timestamp_obj = datetime.datetime.now(datetime.timezone.utc) 

            cursor.execute("""
                INSERT INTO received_emails (id, email_address, sender, subject, body, timestamp)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (email_id_param, to_address, sender, subject, body, timestamp_obj)) # Use string for id
            conn.commit()
            print(f"Simulated email stored for {to_address}: {subject}")
            success_flag = True
            message = f"Email sent to {to_address}"
            status_code = 200
    except psycopg2.Error as e:
        if conn: conn.rollback()
        print(f"Database error storing simulated email for {to_address}: {e}")
    except Exception as e:
        if conn: conn.rollback()
        print(f"General error storing simulated email for {to_address}: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
    return jsonify({"success": success_flag, "message": message}), status_code

# --- Initialize DB ---
try:
    print("Attempting to initialize database schema...")
    init_db()
except Exception as e:
    print(f"Could not initialize database on startup: {e}")
    print("Please ensure your DATABASE_URL environment variable is correctly set and the database is accessible.")

if __name__ == '__main__':
    if not DATABASE_URL:
        print("WARNING: DATABASE_URL is not set. Application might not work correctly.")
        print("Please set it, e.g., export DATABASE_URL='postgresql://user:pass@host:port/dbname'")
    app.run(debug=True, port=5000)

