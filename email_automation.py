"""
GoddyGraphix Email Automation Script
=====================================
Sends TWO emails when a contact form is submitted:
  1. To the BUSINESSMAN  — contains the customer's details
  2. To the CUSTOMER     — auto-reply / confirmation message

Uses EmailJS REST API to send emails.
Run this as a standalone Flask server OR import the send_emails() function.
"""

import os
import requests
from dotenv import load_dotenv

load_dotenv()

# ─── EmailJS Configuration ───────────────────────────────────────────────
EMAILJS_PUBLIC_KEY = os.getenv("EMAILJS_PUBLIC_KEY")
EMAILJS_SERVICE_ID = os.getenv("EMAILJS_SERVICE_ID")
EMAILJS_BUSINESS_TEMPLATE_ID = os.getenv("EMAILJS_BUSINESS_TEMPLATE_ID")   # For businessman
EMAILJS_CUSTOMER_TEMPLATE_ID = os.getenv("EMAILJS_CUSTOMER_TEMPLATE_ID")   # For customer auto-reply

# ─── Businessman Email Address ────────────────────────────────────────────
BUSINESSMAN_EMAIL = os.getenv("BUSINESSMAN_EMAIL", "laryeamel06@gmail.com")

# ─── EmailJS REST API ─────────────────────────────────────────────────────
EMAILJS_API_URL = "https://api.emailjs.com/api/v1.0/email/send"


def send_businessman_email(data: dict) -> dict:
    """
    Send customer inquiry details to the businessman.
    Template variables expected: {{name}}, {{email}}, {{phone}},
                                  {{service}}, {{subject}}, {{message}}, {{date}}
    """
    template_params = {
        "to_email": BUSINESSMAN_EMAIL,
        "name": data.get("name", "Unknown"),
        "email": data.get("email", "N/A"),
        "phone": data.get("phone", "N/A"),
        "service": data.get("service", "General Inquiry"),
        "subject": data.get("subject", "New Contact Request"),
        "message": data.get("message", ""),
        "date": data.get("created_at", ""),
    }

    payload = {
        "service_id": EMAILJS_SERVICE_ID,
        "template_id": EMAILJS_BUSINESS_TEMPLATE_ID,
        "user_id": EMAILJS_PUBLIC_KEY,
        "template_params": template_params,
    }

    response = requests.post(
        EMAILJS_API_URL,
        json=payload,
        headers={"Content-Type": "application/json"},
    )

    print(f"[BUSINESSMAN EMAIL] Status: {response.status_code} — {response.text}")
    return {"status": response.status_code, "text": response.text}


def send_customer_email(data: dict) -> dict:
    """
    Send auto-reply / confirmation to the customer.
    Template variables expected: {{to_name}}, {{to_email}}, {{subject}}, {{message}}
    """
    template_params = {
        "to_email": data.get("email", ""),
        "to_name": data.get("name", "Valued Customer"),
        "subject": f"Re: {data.get('subject', 'Your Inquiry')}",
        "message": (
            f"Dear {data.get('name', 'Valued Customer')},\n\n"
            "Thank you for contacting Goddy Graphix! We have received your inquiry and will get back to you shortly.\n\n"
            f"Your inquiry details:\n"
            f"Service: {data.get('service', 'General Inquiry')}\n"
            f"Subject: {data.get('subject', 'N/A')}\n\n"
            "We appreciate your interest and look forward to working with you.\n\n"
            "Best regards,\n"
            "Goddy Graphix Team\n"
            "📧 laryeamel06@gmail.com\n"
            "📞 +233 59 746 6615"
        ),
    }

    payload = {
        "service_id": EMAILJS_SERVICE_ID,
        "template_id": EMAILJS_CUSTOMER_TEMPLATE_ID,
        "user_id": EMAILJS_PUBLIC_KEY,
        "template_params": template_params,
    }

    response = requests.post(
        EMAILJS_API_URL,
        json=payload,
        headers={"Content-Type": "application/json"},
    )

    print(f"[CUSTOMER EMAIL] Status: {response.status_code} — {response.text}")
    return {"status": response.status_code, "text": response.text}


def send_emails(data: dict) -> dict:
    """
    Main entry point — sends BOTH emails.
    Call this function from your Node.js server or use the Flask endpoint.
    """
    print(f"\n{'='*50}")
    print(f"[EMAIL] Sending emails for: {data.get('name')} ({data.get('email')})")
    print(f"{'='*50}")

    result_business = send_businessman_email(data)
    result_customer = send_customer_email(data)

    return {
        "businessman_email": result_business,
        "customer_email": result_customer,
    }


# ─── Flask Web Server (Standalone Mode) ────────────────────────────────────
if __name__ == "__main__":
    from flask import Flask, request, jsonify

    app = Flask(__name__)

    @app.route("/send-emails", methods=["POST"])
    def handle_send_emails():
        data = request.get_json()

        # Validate required fields
        if not data.get("name") or not data.get("email") or not data.get("message"):
            return jsonify({"error": "Name, email, and message are required"}), 400

        result = send_emails(data)

        success = (
            result["businessman_email"]["status"] == 200
            and result["customer_email"]["status"] == 200
        )

        if success:
            return jsonify({"success": True, "message": "Both emails sent successfully"})
        else:
            return jsonify({"success": False, "message": "One or more emails failed", "details": result}), 500

    @app.route("/health", methods=["GET"])
    def health_check():
        return jsonify({"status": "ok", "service": "GoddyGraphix Email Automation"})

    print("\n" + "="*50)
    print("🚀 GoddyGraphix Email Automation Server")
    print("   Running on: http://localhost:5000")
    print("   Endpoint: POST /send-emails")
    print("="*50 + "\n")

    app.run(host="0.0.0.0", port=5000, debug=True)
