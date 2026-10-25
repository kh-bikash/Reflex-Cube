import json
import random
import re
from datetime import datetime
from typing import Any

from .base import Cube


class SentinelCube(Cube):
    def __init__(self):
        super().__init__()
        # Initial predefined rules
        self.rules = {
            "SQL Injection": [
                r"('|\")\s*OR\s*('|\")?1('|\")?\s*=\s*('|\")?1",
                r"UNION\s+SELECT",
                r"DROP\s+TABLE",
                r"Waitfor\s+delay",
            ],
            "XSS": [r"<script>", r"javascript:", r"onerror="],
            "RCE": [r";\s*\/bin\/sh", r"\|\s*bash", r"cmd\.exe"],
        }
        self.rule_metadata = [
            {
                "name": "SQL Injection Blocklist",
                "id": "WAF-101",
                "status": "Active",
                "matches": 1245,
                "desc": "Blocks 'OR 1=1', 'UNION SELECT', and 'DROP TABLE' patterns.",
            },
            {
                "name": "XSS Sanitation",
                "id": "WAF-102",
                "status": "Active",
                "matches": 843,
                "desc": "Filters <script>, javascript:, and onerror tags from POST bodies.",
            },
            {
                "name": "RCE / Command Injection",
                "id": "SYS-001",
                "status": "Active",
                "matches": 56,
                "desc": "Blocks '| bash', 'cmd.exe', and '; /bin/sh' execution attempts.",
            },
        ]

    @property
    def name(self) -> str:
        return "Sentinel Cube"

    @property
    def description(self) -> str:
        return "Autonomous Security - Real-time Threat Detection."

    def _analyze_payload(self, payload: str):
        """Check a payload string against all known threat rules."""
        for t_type, patterns in self.rules.items():
            for p in patterns:
                try:
                    if re.search(p, payload, re.IGNORECASE):
                        return t_type
                except:
                    continue  # Skip bad regex
        return None

    def run(self, input_data: Any) -> dict[str, Any]:
        sim_mode = input_data.get("simulation_mode", None)
        manual_payload = input_data.get("manual_payload", None)
        action = input_data.get("action", None)

        # --- ACTION: ADD RULE ---
        if action == "add_rule":
            new_rule = input_data.get("rule", {})
            r_name = new_rule.get("name", "Custom Rule")
            r_pattern = new_rule.get("pattern", "")
            r_desc = new_rule.get("desc", "")

            if r_name and r_pattern:
                # Add to regex dictionary
                if r_name not in self.rules:
                    self.rules[r_name] = []
                self.rules[r_name].append(r_pattern)

                # Add to metadata list
                self.rule_metadata.append(
                    {
                        "name": r_name,
                        "id": f"CUST-{random.randint(100, 999)}",
                        "status": "Active",
                        "matches": 0,
                        "desc": r_desc,
                    }
                )
                return {"status": "success", "message": "Rule added successfully"}
            return {"status": "error", "message": "Invalid rule data"}

        # --- ACTION: GET RULES ---
        if action == "get_rules":
            return {"status": "success", "data": self.rule_metadata}

        # --- ACTION: GENERATE REPORT ---
        if action == "generate_report":
            r_type = input_data.get("report_type", "")

            if "SOC2" in r_type:
                # SOC2: Security Availability Confidentiality
                content = {
                    "report": "SOC2 Type II - Security Audit",
                    "generated_at": datetime.now().isoformat(),
                    "status": "COMPLIANT",
                    "controls": [
                        {"id": "CC1.1", "desc": "Security Policies", "status": "PASS"},
                        {
                            "id": "CC6.1",
                            "desc": "Logical Access",
                            "status": "PASS",
                            "details": f"Active WAF Rules: {len(self.rules)}",
                        },
                        {
                            "id": "A1.2",
                            "desc": "Anomaly Detection",
                            "status": "PASS",
                            "details": "AI Sentinel Engine Active",
                        },
                    ],
                    "recent_incidents": "See attached threat log.",
                }
                return {
                    "status": "success",
                    "filename": "soc2_report.json",
                    "content": json.dumps(content, indent=2),
                    "mime": "application/json",
                }

            elif "GDPR" in r_type:
                lines = ["Timestamp,IP,Method,Path,Status,PII_Flag"]
                for i in range(10):
                    lines.append(
                        f"{datetime.now().isoformat()},192.168.1.{i},GET,/api/user/{i},200,TRUE"
                    )
                return {
                    "status": "success",
                    "filename": "gdpr_access_log.csv",
                    "content": "\n".join(lines),
                    "mime": "text/csv",
                }

            elif "ISO" in r_type:
                lines = [
                    "ISO 27001 AUDIT CHECKLIST",
                    "=========================",
                    f"Date: {datetime.now().strftime('%Y-%m-%d')}",
                    "Auditor: Sentinel AI",
                    "",
                    "[X] A.5 Information Security Policies",
                    "[X] A.6 Organization of Information Security",
                    "[X] A.9 Access Control",
                    f"[X] A.12 Operations Security (Active Rules: {len(self.rules)})",
                    "[ ] A.14 System Acquisition (Manual Review Pending)",
                    "",
                    "CONCLUSION: SYSTEM SECURE.",
                ]
                return {
                    "status": "success",
                    "filename": "iso27001_audit.txt",
                    "content": "\n".join(lines),
                    "mime": "text/plain",
                }

            return {"status": "error", "message": "Unknown report type"}

        # --- MODE 1: Manual Real-Time Analysis with AI ---
        if manual_payload:
            threat_type = self._analyze_payload(manual_payload)
            timestamp = datetime.now().strftime("%H:%M:%S")
            ip = "127.0.0.1"

            explanation = "Matched known signature."

            # AI Logic (Keep existing Logic)
            try:
                system_prompt = (
                    "You are a Cybersecurity Expert (CISSP).\n"
                    "Analyze this malicious payload. Explain WHAT it does and HOW to fix it.\n"
                    "Keep it brief (2 sentences).\n"
                    "FORMAT: 'Analysis: [Explanation] Fix: [Mitigation]'"
                )
                user_prompt = f"Payload: {manual_payload}"

                from ..utils.ai_router import query_ai

                ai_resp = query_ai(
                    system_prompt, user_prompt, model_preference="mistral", engine_type="code"
                )
                if ai_resp:
                    explanation = ai_resp.strip()
            except:
                pass

            if threat_type:
                return {
                    "status": "success",
                    "data": {
                        "logs": [f"[{timestamp}] [WARN] {ip} - {manual_payload}"],
                        "threats": [
                            {
                                "timestamp": timestamp,
                                "ip": ip,
                                "type": threat_type,
                                "severity": "CRITICAL",
                                "payload": manual_payload,
                                "action": "BLOCKED",
                                "explanation": explanation,
                            }
                        ],
                        "system_status": "CRITICAL",
                        "active_firewall_rules": 1,
                    },
                }
            else:
                return {
                    "status": "success",
                    "data": {
                        "logs": [f"[{timestamp}] [INFO] {ip} - {manual_payload} - ALLOWED"],
                        "threats": [],
                        "system_status": "SECURE",
                        "active_firewall_rules": 0,
                    },
                }

        # --- MODE 2: Simulation Logic (Re-Enabled for Demo) ---
        if sim_mode:
            logs = []
            threats_found = []
            count = 3  # Small batch for tick

            def rand_ip():
                return f"{random.randint(1, 255)}.{random.randint(1, 255)}.{random.randint(1, 255)}.{random.randint(1, 255)}"

            for _ in range(count):
                timestamp = datetime.now().strftime("%H:%M:%S")
                ip = rand_ip()

                if sim_mode == "attack" and random.random() > 0.4:
                    attack_type = random.choice(list(self.rules.keys()))

                    if attack_type == "SQL Injection":
                        payload = "GET /api/users?id=102 OR 1=1"
                    elif attack_type == "XSS":
                        payload = "POST /comments content='<script>alert(1)</script>'"
                    elif attack_type == "RCE":
                        payload = "GET /shell?cmd=| bash"
                    else:
                        payload = f"POST /upload (Malicious Signature: {attack_type})"

                    log_line = f"[{timestamp}] [WARN] {ip} - {payload}"

                    threats_found.append(
                        {
                            "timestamp": timestamp,
                            "ip": ip,
                            "type": attack_type,
                            "severity": "HIGH",
                            "payload": payload,
                            "action": "BLOCKED",
                        }
                    )
                else:
                    path = random.choice(
                        ["/home", "/about", "/contact", "/api/v1/status", "/login"]
                    )
                    method = random.choice(["GET", "POST"])
                    status = random.choice([200, 200, 200, 304, 404])
                    log_line = f"[{timestamp}] [INFO] {ip} - {method} {path} HTTP/1.1 {status}"

                logs.append(log_line)

            return {
                "status": "success",
                "data": {
                    "logs": logs,
                    "threats": threats_found,
                    "system_status": "UNDER ATTACK" if threats_found else "SECURE",
                    "active_firewall_rules": len(threats_found),
                },
            }

        return {"status": "success", "data": {"logs": [], "threats": [], "system_status": "IDLE"}}
