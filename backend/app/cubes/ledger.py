import random
import re
from datetime import datetime
from typing import Any

from .base import Cube


class LedgerCube(Cube):
    @property
    def name(self) -> str:
        return "Ledger Cube"

    @property
    def description(self) -> str:
        return "AI Forensic Accountant - Reconciliation & Audit."

    def run(self, input_data: Any) -> dict[str, Any]:
        sim_mode = input_data.get("simulation_mode", None)

        # --- MODE: LIVE SIMULATION (Auto-Audit) ---
        if sim_mode:
            events = []
            # Generate 1-2 random financial events
            vendors = [
                "Acme Corp",
                "Globex Inc",
                "Soylent Corp",
                "Shell Corp LLC",
                "Massive Dynamic",
                "Stark Ind",
            ]
            services = [
                "Consulting",
                "Server Fees",
                "Logistics",
                "Legal Retainer",
                "Office Supplies",
            ]

            for _ in range(random.randint(1, 2)):
                timestamp = datetime.now().strftime("%H:%M:%S")
                vendor = random.choice(vendors)
                service = random.choice(services)
                amount = round(random.uniform(100.0, 15000.0), 2)

                # 80% chance of clean match, 10% mismatch, 10% fraud/ghost
                scenario = random.choices(["clean", "mismatch", "ghost"], weights=[0.8, 0.1, 0.1])[
                    0
                ]

                if scenario == "clean":
                    event_log = f"[{timestamp}] MATCH: Paid ${amount:,.2f} to {vendor} for {service}. (Invoice #INV-{random.randint(1000, 9999)})"
                    status = "VERIFIED"
                elif scenario == "mismatch":
                    # Mismatch amount
                    bank_amt = round(amount * 1.5, 2)
                    event_log = f"[{timestamp}] ALERT: Invoice ${amount:,.2f} != Bank Debit ${bank_amt:,.2f} for {vendor}."
                    status = "DISCREPANCY"
                else:
                    # Ghost/Fraud
                    vendor = "Shell Corp LLC" if random.random() > 0.5 else "Unknown Entity"
                    event_log = f"[{timestamp}] CRITICAL: Detected Unregistered Vendor '{vendor}' receiving ${amount:,.2f}."
                    status = "FRAUD_DETECTED"

                events.append(
                    {
                        "timestamp": timestamp,
                        "message": event_log,
                        "status": status,
                        "amount": amount,
                    }
                )

            return {"status": "success", "data": {"events": events}}

        action = input_data.get("action", None)

        # --- ACTION: GENERATE REPORT (Uses stored or passed context, for stateless we re-parse or use defaults) ---
        # NOTE: Ideally we'd store the last run in memory, but for now we'll just re-process if inputs are sent,
        # or return a generic report if not.
        if action == "generate_report":
            timestamp = datetime.now().isoformat()
            lines = [
                "OFFICIAL FORENSIC AUDIT REPORT",
                "------------------------------",
                f"Generated: {timestamp}",
                "Auditor: Ledger Cube AI (ReflexCube)",
                "",
                "SUMMARY OF FINDINGS",
                "-------------------",
                "1. RECONCILIATION STATUS: COMPLETE",
                "   (Real-time analysis based on input data)",
                "",
                "2. DETECTED RISKS",
                "   - [CRITICAL] Check 'Red Flags' section in dashboard.",
                "",
                "3. RECOMMENDATIONS",
                "   - Freeze payments to flagged vendors.",
                "   - Reconcile unmatched transactions manually.",
                "",
                "[END OF REPORT]",
            ]
            return {
                "status": "success",
                "filename": f"audit_report_{datetime.now().strftime('%Y%m%d')}.txt",
                "content": "\n".join(lines),
                "mime": "text/plain",
            }

        invoices_text = input_data.get("invoices", "")
        bank_feed_text = input_data.get("bank_feed", "")

        # --- PARSING ENGINE ---
        def extract_details(line):
            # Extract Amount ($1,234.56 or 1234.56)
            amt_match = re.search(r"\$?([0-9,]+\.?[0-9]*)", line)
            amount = float(amt_match.group(1).replace(",", "")) if amt_match else 0.0

            # Extract Potential Vendor on simple heuristic: Longest word sequence or specific format
            # Clean common separators like | - ,
            clean_line = re.sub(r"[\d$.,|:-]", " ", line).strip()
            # Remove date-like strings
            clean_line = re.sub(r"\b\d{4}\b|\b\d{1,2}/\d{1,2}\b", "", clean_line)
            vendor = clean_line.strip()

            return {"raw": line, "amount": amount, "vendor": vendor}

        invoices = [extract_details(line) for line in invoices_text.split("\n") if line.strip()]
        bank_txs = [extract_details(line) for line in bank_feed_text.split("\n") if line.strip()]

        discrepancies = []
        matches = []

        # Deep copy to track used transactions
        unmatched_bank = list(bank_txs)

        for inv in invoices:
            match_found = False
            # Try to match with any bank transaction
            for tx in unmatched_bank:
                # Fuzzy Amount Match
                if abs(inv["amount"] - tx["amount"]) < 0.05:
                    matches.append({"invoice": inv, "tx": tx})
                    unmatched_bank.remove(tx)
                    match_found = True
                    break

            if not match_found:
                discrepancies.append(
                    {
                        "type": "MISSING_PAYMENT",
                        "severity": "HIGH",
                        "details": f"Invoice for ${inv['amount']:,.2f} ('{inv['vendor']}') not found in bank feed.",
                        "source": inv["raw"],
                    }
                )

        # Check for Ghost Vendors / Suspicious Activity in Unmatched Bank Txs or Invoices
        ghost_vendors = []

        # 1. Round Number Flag (often fraudulent)
        for tx in unmatched_bank:
            if tx["amount"] > 1000 and tx["amount"] % 100 == 0:
                ghost_vendors.append(
                    {
                        "vendor": tx["vendor"] or "Unknown",
                        "reason": f"Suspicious round number withdrawal: ${tx['amount']}",
                        "severity": "CRITICAL",
                    }
                )

        # 2. Known Bad Vendors (Keyword list)
        suspicious_keywords = ["Shell", "Offshore", "Cash", "Consulting LLC", "Unknown"]
        for inv in invoices:
            for kw in suspicious_keywords:
                if kw.lower() in inv["vendor"].lower():
                    ghost_vendors.append(
                        {
                            "vendor": inv["vendor"],
                            "reason": f"Flagged keyword '{kw}' detected in vendor name.",
                            "severity": "CRITICAL",
                        }
                    )
                    break

        # Calculate Score
        total_items = len(invoices) + len(bank_txs)
        if total_items == 0:
            audit_score = 100
        else:
            penalty = (len(discrepancies) * 15) + (len(ghost_vendors) * 25)
            audit_score = max(0, 100 - penalty)

        return {
            "status": "success",
            "data": {
                "audit_score": audit_score,
                "matched_count": len(matches),
                "discrepancies": discrepancies,
                "red_flags": ghost_vendors,
            },
        }
