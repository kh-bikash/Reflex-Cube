from typing import Any

from .base import Cube


class TravelCube(Cube):
    @property
    def name(self) -> str:
        return "Travel Cube"

    @property
    def description(self) -> str:
        return "AI Travel Guide - Itineraries & Budget Planner."

    def run(self, input_data: Any) -> dict[str, Any]:
        destination = input_data.get("destination", "").strip()
        vibe = input_data.get("vibe", "Balanced")
        budget_level = input_data.get("budget", "Mid-Range")

        if not destination:
            return {"status": "error", "message": "No destination provided."}

        # AI Analysis & Itinerary Generation
        try:
            system_prompt = (
                "You are an Expert Travel Guide.\n"
                "Create a 3-day itinerary.\n"
                "OUTPUT FORMAT (JSON ONLY):\n"
                "{\n"
                '  "destination_name": "Kyoto",\n'
                '  "tagline": "City of Shrines",\n'
                '  "total_budget_est": "1500 USD",\n'
                '  "best_time": "March",\n'
                '  "days": [\n'
                "    {\n"
                '      "day": 1,\n'
                '      "theme": "Sacred",\n'
                '      "activities": [\n'
                '        {"time": "Morning", "title": "Shrine", "desc": "Hike early.", "cost_usd": 0},\n'
                '        {"time": "Afternoon", "title": "Market", "desc": "Try food.", "cost_usd": 30}\n'
                "      ]\n"
                "    }\n"
                "  ],\n"
                '  "local_tips": ["Use a train card."]\n'
                "}\n"
                "RULES:\n"
                "1. Output exactly ONE valid JSON object.\n"
                "2. Do NOT use unescaped quotes inside strings.\n"
                "3. Every key MUST be wrapped in double quotes.\n"
            )

            user_prompt = (
                f"Plan a {budget_level} trip to {destination} with a {vibe} vibe. JSON Only."
            )

            # API Call via Router (Using general engine, simpler schema)
            from ..utils.ai_router import extract_json, query_ai

            content = query_ai(
                system_prompt,
                user_prompt,
                model_preference="mistral",
                engine_type="general",
                allow_pollinations=True,
            )

            if content:
                # Debug: Print raw content to see why it failed
                print(f"[Travel Cube] Raw AI Output: {content[:100]}...")

                data = extract_json(content)
                if not data:
                    print(f"[Travel Cube] JSON Parsing Failed. Content was: {content}")
                    # Fallback instead of crash
                    data = {
                        "destination_name": destination,
                        "tagline": "The Adventure Awaits",
                        "total_budget_est": budget_level,
                        "best_time": "Anytime",
                        "days": [
                            {
                                "day": 1,
                                "theme": "Arrival & Exploration",
                                "activities": [
                                    {
                                        "time": "All Day",
                                        "title": "City Tour",
                                        "desc": "Explore the local landmarks.",
                                        "cost": "Free",
                                    }
                                ],
                            },
                            {
                                "day": 2,
                                "theme": "Culture & Food",
                                "activities": [
                                    {
                                        "time": "All Day",
                                        "title": "Food Tasting",
                                        "desc": "Try local delicacies.",
                                        "cost": "$$ ",
                                    }
                                ],
                            },
                            {
                                "day": 3,
                                "theme": "Relaxation",
                                "activities": [
                                    {
                                        "time": "All Day",
                                        "title": "Leisure",
                                        "desc": "Enjoy a relaxing day.",
                                        "cost": "Free",
                                    }
                                ],
                            },
                        ],
                        "local_tips": ["Check local weather.", "Book in advance."],
                    }

                # Add default structure if missing
                data["destination_name"] = data.get("destination_name", destination)
                data["days"] = data.get("days", [])

                return {"status": "success", "data": data}
            else:
                raise Exception("AI Provider Unavailable (All Routes Failed)")

        except Exception as e:
            print(f"[Travel Cube Error] {e!s}")
            # Even here, try to return something useful
            return {
                "status": "success",
                "data": {
                    "destination_name": destination,
                    "tagline": "Offline Mode",
                    "total_budget_est": "N/A",
                    "days": [
                        {
                            "day": 1,
                            "theme": "Service Offline",
                            "activities": [
                                {
                                    "time": "N/A",
                                    "title": "System Offline",
                                    "desc": "Please try again later.",
                                    "cost": "0",
                                }
                            ],
                        }
                    ],
                    "local_tips": ["System is currently offline."],
                },
            }
