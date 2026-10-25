import io
import json
from typing import Any

import pypdf

from .base import Cube


class CareerCube(Cube):
    @property
    def name(self) -> str:
        return "Career Cube"

    @property
    def description(self) -> str:
        return "AI Recruiter & Resume Optimizer."

    def run(self, input_data: Any) -> dict[str, Any]:
        pdf_b64 = input_data.get("pdf_base64")

        extracted_text = ""

        # 1. PDF Parsing (pypdf)
        if pdf_b64:
            try:
                import base64

                if "base64," in pdf_b64:
                    pdf_b64 = pdf_b64.split("base64,")[1]

                pdf_bytes = base64.b64decode(pdf_b64)
                reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))

                for page in reader.pages:
                    extracted_text += page.extract_text() + "\n"

                print(f"[Career Cube] Extracted {len(extracted_text)} chars from PDF.")

            except Exception as e:
                return {"status": "error", "message": f"PDF Parsing Error: {e!s}"}
        else:
            return {"status": "error", "message": "No PDF provided."}

        # 2. Expert Recruiter Logic (Pollinations AI)
        try:
            # Expert Recruiter Persona
            system_prompt = (
                "You are an Elite Technical Recruiter and Resume Writer for top-tier tech companies (FAANG).\n"
                "Your goal is to be brutal yet constructive, helping candidates pass ATS (Applicant Tracking Systems).\n\n"
                "INPUT: Raw text from a candidate's resume.\n"
                "TASK:\n"
                "1. ANALYZE: Identify weak action verbs, lack of metrics, and fluff.\n"
                "2. SCORE: Give an ATS Score (0-100) based on keywords, formatting, and impact.\n"
                "3. CRITIQUE: Provide 3 specific 'Red Flags' and 3 'Green Flags'.\n"
                "4. KEYWORDS: List 5 missing critical keywords for their role.\n"
                "5. REWRITE RESUME ONLY: Rewrite ONLY the resume in high-quality Markdown. Transform bullet points into 'STAR' method (Situation, Task, Action, Result). Quantify impact (e.g., 'Improved performance by 20%'). DO NOT include the cover letter here.\n"
                "6. COVER LETTER SEPARATELY: Write a compelling cover letter in a SEPARATE field. Do NOT merge it with the resume.\n\n"
                "CRITICAL INSTRUCTIONS:\n"
                "- Return ONLY valid JSON. No markdown code fences, no extra text, just pure JSON.\n"
                "- The 'rewritten_markdown' field must contain ONLY the resume in markdown format.\n"
                "- The 'cover_letter' field must contain ONLY the cover letter text.\n"
                "- Keep them completely separate.\n\n"
                "OUTPUT FORMAT (return this exact structure as raw JSON):\n"
                "{\n"
                '  "score": 75,\n'
                '  "critique": {\n'
                '    "red_flags": ["Used passive voice", "Missing metrics", "Typos"],\n'
                '    "green_flags": ["Good education section", "Strong technical skills"]\n'
                "  },\n"
                '  "missing_keywords": ["CI/CD", "Kubernetes", "System Design"],\n'
                '  "rewritten_markdown": "# John Doe\\n\\n## Professional Summary\\n...",\n'
                '  "cover_letter": "Dear Hiring Manager,\\n\\nI am writing to express my interest..."\n'
                "}"
            )

            # Truncate text strictly to fit within the lower 2048 context limit
            safe_text = extracted_text[:1500]

            user_prompt = f"Here is my resume text:\n\n{safe_text}\n\nPlease analyze and optimize it. Return ONLY the JSON object, nothing else."

            # Retry Logic
            # API Call via Router
            from ..utils.ai_router import extract_json, query_ai

            content = query_ai(
                system_prompt, user_prompt, model_preference="mistral", engine_type="code"
            )

            if content:
                # Debug: Log raw response
                print(
                    f"[Career Cube] Raw API response (first 200 chars): {content[:200].encode('ascii', 'replace').decode('ascii')}"
                )

                # The API might return structured JSON with the content nested inside
                # Try to parse it as JSON first
                try:
                    api_json = json.loads(content)
                    print(f"[Career Cube] API returned JSON with keys: {list(api_json.keys())}")

                    # Extract actual content from various possible fields
                    if isinstance(api_json, dict):
                        # Try different possible content fields
                        if "content" in api_json:
                            content = api_json["content"]
                        elif "text" in api_json:
                            content = api_json["text"]
                        elif "message" in api_json:
                            content = api_json["message"]
                        elif api_json.get("tool_calls"):
                            tool_call = api_json["tool_calls"][0]
                            if "function" in tool_call and "arguments" in tool_call["function"]:
                                content = tool_call["function"]["arguments"]
                        elif "reasoning_content" in api_json:
                            content = api_json["reasoning_content"]
                        else:
                            if "score" in api_json or "rewritten_markdown" in api_json:
                                content = api_json
                except json.JSONDecodeError:
                    pass

                data = extract_json(str(content))
                if not data:
                    raise Exception("Failed to parse JSON response from AI.")

                print(f"[Career Cube] Raw AI Response Keys: {list(data.keys())}")
                print(
                    f"[Career Cube] Cover Letter from AI (first 100 chars): {str(data.get('cover_letter', 'MISSING'))[:100].encode('ascii', 'replace').decode('ascii')}"
                )

                # Enforce Schema
                data["score"] = data.get("score", 0)
                data["critique"] = data.get("critique", {})
                data["critique"]["red_flags"] = data["critique"].get("red_flags", [])
                data["critique"]["green_flags"] = data["critique"].get("green_flags", [])
                data["missing_keywords"] = data.get("missing_keywords", [])
                data["rewritten_markdown"] = data.get(
                    "rewritten_markdown", "# Rewrite Failed\nCould not generate resume."
                )
                data["cover_letter"] = data.get("cover_letter", "")

                # Heuristic: Split if cover letter is embedded in resume
                resume_md = data["rewritten_markdown"]
                cover_letter = data["cover_letter"]

                print(
                    f"[Career Cube] Pre-split - Resume length: {len(resume_md)}, Cover Letter length: {len(cover_letter)}"
                )

                # Always check if cover letter is in the resume markdown
                cover_letter_markers = [
                    "Dear Hiring Manager",
                    "Dear Sir/Madam",
                    "To Whom It May Concern",
                    "Dear Recruiter",
                ]
                has_cover_letter_in_resume = any(
                    marker in resume_md for marker in cover_letter_markers
                )

                if has_cover_letter_in_resume:
                    print(
                        "[Career Cube] Detected cover letter in resume markdown. Attempting split..."
                    )
                    # Try to split at common resume/cover letter boundary
                    split_done = False

                    # Method 1: Split at "---"
                    if "---" in resume_md and not split_done:
                        parts = resume_md.split("---")
                        if len(parts) >= 2:
                            data["rewritten_markdown"] = parts[0].strip()
                            data["cover_letter"] = parts[1].strip()
                            split_done = True
                            print("[Career Cube] Split using '---' separator")

                    # Method 2: Split at cover letter heading
                    if not split_done:
                        for heading in ["# Cover Letter", "## Cover Letter", "### Cover Letter"]:
                            if heading in resume_md:
                                idx = resume_md.index(heading)
                                data["rewritten_markdown"] = resume_md[:idx].strip()
                                data["cover_letter"] = resume_md[idx:].replace(heading, "").strip()
                                split_done = True
                                print(f"[Career Cube] Split at '{heading}' heading")
                                break

                    # Method 3: Split at "Dear" marker
                    if not split_done:
                        for marker in cover_letter_markers:
                            if marker in resume_md:
                                idx = resume_md.index(marker)
                                # Only split if "Dear" appears reasonably far into the doc (not at the top)
                                if idx > 100:  # At least 100 chars into the resume
                                    data["rewritten_markdown"] = resume_md[:idx].strip()
                                    data["cover_letter"] = resume_md[idx:].strip()
                                    split_done = True
                                    print(f"[Career Cube] Split at '{marker}' marker")
                                    break

                # Final fallback: If still no cover letter, generate a basic one
                if not data["cover_letter"] or len(data["cover_letter"].strip()) < 50:
                    print("[Career Cube] No valid cover letter found. Generating basic fallback...")
                    # Extract name from resume (look for # Name pattern)
                    import re

                    name_match = re.search(r"^#\s+(.+)$", data["rewritten_markdown"], re.MULTILINE)
                    candidate_name = name_match.group(1).strip() if name_match else "Candidate"

                    data["cover_letter"] = f"""Dear Hiring Manager,

I am writing to express my strong interest in joining your team. As detailed in my resume, I bring a comprehensive background in technology and a proven track record of delivering results.

My experience has equipped me with the skills and mindset necessary to make immediate contributions to your organization. I am particularly excited about the opportunity to apply my expertise in a dynamic environment where innovation and excellence are valued.

I would welcome the opportunity to discuss how my background, skills, and enthusiasm align with your team's needs.

Thank you for your consideration.

Sincerely,
{candidate_name}"""
                    print(
                        f"[Career Cube] Generated fallback cover letter ({len(data['cover_letter'])} chars)"
                    )

                print(
                    f"[Career Cube] Final - Resume length: {len(data['rewritten_markdown'])}, Cover Letter length: {len(data['cover_letter'])}"
                )

                return {"status": "success", "data": data}

            else:
                raise Exception("AI Provider Unavailable (All Routes Failed)")

        except Exception as e:
            print(f"[Career Cube Error] {e!s}")
            return {"status": "error", "message": f"Optimization failed: {e!s}"}
