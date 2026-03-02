import os
import json
import httpx
from typing import List, Dict, Any, Optional

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:0.5b")

EXTRACTION_PROMPT = """You are a task extraction assistant. Your job is to extract actionable tasks from meeting notes or transcripts.

Analyze the following text and extract ALL tasks, to-do items, action items, and assignments mentioned. Be thorough - it is better to include a task that might not be actionable than to miss one that is. For each task, identify:
- The task title (do not include the person's name in the title, just the action itself)
- An optional description (additional context if available)
- An optional due date (if mentioned)
- An optional priority (high, medium, low - if indicated)

Task title examples:
- WRONG: "Michael needs to review the budget"
- CORRECT: "Review the budget"

Return your response as a JSON array of tasks. Each task should have this structure:
{{
  "title": "Review the budget",
  "description": "Additional context (optional)",
  "dueDate": "YYYY-MM-DD (optional)",
  "priority": "high/medium/low (optional)"
}}

If no tasks are found, return an empty array: []

TEXT TO ANALYZE:
---
{text}
---

Respond ONLY with the JSON array, no additional text or explanation."""

TARGETED_EXTRACTION_PROMPT = """You are a task extraction assistant. Your job is to extract ALL tasks from meeting notes or transcripts that belong to a specific person.

Extract tasks that are assigned to, mentioned for, or the responsibility of: {target_individual}

Consider these name variations when searching:
- LAST NAME ONLY: If given "John Smith", also look for just "Smith"
- FIRST NAME ONLY: If given "John Smith", also look for just "John"
- NICKNAMES: Common nicknames (Michael=Mike, William=Bill, Robert=Bob, Jennifer=Jen, Elizabeth=Liz, Christopher=Chris, Katherine=Kate, Alexander=Alex, Benjamin=Ben, Nicholas=Nick, Samantha=Sam, Jessica=Jess, Rebecca=Becca, Timothy=Tim, Matthew=Matt, Anthony=Tony, Thomas=Tom, Andrew=Andy, Daniel=Dan, Joseph=Joe, David=Dave, Richard=Rick, Jonathan=Jon, Gregory=Greg, Charles=Charlie, Edward=Ed)

Look for tasks where {target_individual} (or any name variation) is:
- Directly assigned a task ("{target_individual} will/should/needs to...")
- Mentioned as responsible for something
- Asked to do something
- Volunteered for something

Be thorough - it is better to include a borderline task than to miss one. For each task, identify:
- The task title (do not include the person's name in the title, just the action itself)
- An optional description (additional context if available)
- An optional due date (if mentioned)
- An optional priority (high, medium, low - if indicated)

Task title examples:
- WRONG: "Michael needs to review the budget"
- CORRECT: "Review the budget"

Return your response as a JSON array of tasks. Each task should have this structure:
{{
  "title": "Review the budget",
  "description": "Additional context (optional)",
  "dueDate": "YYYY-MM-DD (optional)",
  "priority": "high/medium/low (optional)"
}}

Only include tasks for {target_individual} (including name variations). Do not include tasks for other people.
If no tasks are found for {target_individual}, return an empty array: []

TEXT TO ANALYZE:
---
{text}
---

Respond ONLY with the JSON array, no additional text or explanation."""


async def extract_tasks_from_text(text: str, target_individual: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Extract tasks from text using Ollama LLM.

    Args:
        text: The text to extract tasks from (meeting notes, transcript, etc.)
        target_individual: Optional name to filter tasks for a specific person

    Returns:
        List of extracted tasks with title, description, dueDate, priority
    """
    if target_individual:
        prompt = TARGETED_EXTRACTION_PROMPT.format(text=text, target_individual=target_individual)
    else:
        prompt = EXTRACTION_PROMPT.format(text=text)

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(
                f"{OLLAMA_HOST}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,  # Low temperature for consistent extraction
                        "num_predict": 4096,  # Enough tokens for task list
                    }
                }
            )
            response.raise_for_status()

            result = response.json()
            response_text = result.get("response", "[]")

            # Try to parse the JSON response
            tasks = parse_tasks_response(response_text)
            return tasks

        except httpx.TimeoutException:
            raise Exception("Ollama request timed out. The model may still be loading.")
        except httpx.HTTPStatusError as e:
            raise Exception(f"Ollama request failed: {e.response.status_code}")
        except Exception as e:
            raise Exception(f"Failed to extract tasks: {str(e)}")


def parse_tasks_response(response_text: str) -> List[Dict[str, Any]]:
    """
    Parse the LLM response to extract the JSON tasks array.
    Handles various response formats and edge cases.
    """
    # Clean up the response - remove markdown code fences if present
    text = response_text.strip()

    # Remove markdown code fences
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json or ```)
        lines = lines[1:]
        # Remove last line if it's closing fence
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    # Try to find JSON array in the response
    # Look for the start of a JSON array
    start_idx = text.find("[")
    end_idx = text.rfind("]")

    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        json_str = text[start_idx:end_idx + 1]
        try:
            tasks = json.loads(json_str)
            if isinstance(tasks, list):
                # Validate and clean tasks
                validated_tasks = []
                for task in tasks:
                    validated = validate_task(task)
                    if validated:
                        validated_tasks.append(validated)
                return validated_tasks
        except json.JSONDecodeError as e:
            print(f"JSON decode error: {e}")
            pass

    # If JSON parsing fails, return empty array
    return []


GENERATE_FIELD_PROMPT = """You are a technical writer creating content for an Azure DevOps {work_item_type} work item.

Write the content for the "{field_name}" field.

Follow these instructions from the user:
{ai_instructions}

Use the following task context to inform your writing:
---
{context}
---

Output plain text only. Use bullet points (- item) or numbered lists (1. item) where appropriate. Do NOT use HTML tags. Do NOT wrap output in markdown code fences. Do NOT include any preamble or explanation — output ONLY the field content."""


async def generate_field_content(context: str, field_name: str, work_item_type: str, ai_instructions: str) -> str:
    """
    Generate HTML content for an ADO work item field using Ollama LLM.
    """
    prompt = GENERATE_FIELD_PROMPT.format(
        work_item_type=work_item_type,
        field_name=field_name,
        ai_instructions=ai_instructions,
        context=context,
    )

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(
                f"{OLLAMA_HOST}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 2048,
                    }
                }
            )
            response.raise_for_status()

            result = response.json()
            response_text = result.get("response", "").strip()

            # Strip markdown code fences if present
            if response_text.startswith("```"):
                lines = response_text.split("\n")
                lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                response_text = "\n".join(lines).strip()

            return response_text

        except httpx.TimeoutException:
            raise Exception("Ollama request timed out. The model may still be loading.")
        except httpx.HTTPStatusError as e:
            raise Exception(f"Ollama request failed: {e.response.status_code}")
        except Exception as e:
            raise Exception(f"Failed to generate field content: {str(e)}")


EMAIL_CLASSIFICATION_PROMPT = """You are an email classification assistant. Classify the following email into one of three categories:

1. "task" — The email contains a request, assignment, action item, or something the recipient needs to do.
2. "question" — The email asks a question that needs an answer.
3. "ignore" — The email is informational, a newsletter, auto-generated notification, or requires no action.

Also suggest a concise task title based on the email content.
- For "task" emails: summarize the action item as a task title (imperative form, e.g., "Review Q4 budget report")
- For "question" emails: use format "Answer <sender>'s email: <brief subject summary>"
- For "ignore" emails: just use the subject line

Email Details:
From: {sender}
Subject: {subject}
Body:
{body}

Respond ONLY with a JSON object in this format:
{{"classification": "task"|"question"|"ignore", "task_title": "suggested title", "confidence": 0.0-1.0}}"""


async def classify_email_content(subject: str, body: str, sender: str) -> Dict[str, Any]:
    """
    Classify an email as task, question, or ignore using Ollama LLM.
    """
    prompt = EMAIL_CLASSIFICATION_PROMPT.format(
        subject=subject,
        body=body[:3000],
        sender=sender,
    )

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(
                f"{OLLAMA_HOST}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,
                        "num_predict": 256,
                    }
                }
            )
            response.raise_for_status()

            result = response.json()
            response_text = result.get("response", "").strip()

            # Parse JSON from response
            if response_text.startswith("```"):
                lines = response_text.split("\n")
                lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                response_text = "\n".join(lines).strip()

            start = response_text.find("{")
            end = response_text.rfind("}")
            if start != -1 and end != -1 and end > start:
                parsed = json.loads(response_text[start:end + 1])
                classification = parsed.get("classification", "ignore")
                if classification not in ("task", "question", "ignore"):
                    classification = "ignore"
                return {
                    "classification": classification,
                    "task_title": parsed.get("task_title", subject),
                    "confidence": float(parsed.get("confidence", 0.5)),
                }

            return {"classification": "ignore", "task_title": subject, "confidence": 0.3}

        except httpx.TimeoutException:
            raise Exception("Ollama request timed out.")
        except httpx.HTTPStatusError as e:
            raise Exception(f"Ollama request failed: {e.response.status_code}")
        except json.JSONDecodeError:
            return {"classification": "ignore", "task_title": subject, "confidence": 0.3}
        except Exception as e:
            raise Exception(f"Failed to classify email: {str(e)}")


EMAIL_REPLY_PROMPT = """You are an email reply assistant. Draft a professional reply to the following email.

Original Email:
From: {email_sender}
Subject: {email_subject}
Body:
{email_body}

Task Context:
Title: {task_title}
{task_context}

{template_section}

Write a concise, professional reply. Do not include Subject line or email headers — just the reply body text.
Output ONLY the reply text, no preamble or explanation."""


async def generate_reply_content(
    email_subject: str,
    email_body: str,
    email_sender: str,
    task_title: str,
    task_context: str = "",
    template: str = "",
) -> str:
    """
    Generate a reply to an email using Ollama LLM.
    """
    template_section = ""
    if template:
        template_section = f"Use this template as a starting point (fill in variables):\n{template}"

    prompt = EMAIL_REPLY_PROMPT.format(
        email_subject=email_subject,
        email_body=email_body[:3000],
        email_sender=email_sender,
        task_title=task_title,
        task_context=task_context,
        template_section=template_section,
    )

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(
                f"{OLLAMA_HOST}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.4,
                        "num_predict": 1024,
                    }
                }
            )
            response.raise_for_status()

            result = response.json()
            response_text = result.get("response", "").strip()

            if response_text.startswith("```"):
                lines = response_text.split("\n")
                lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                response_text = "\n".join(lines).strip()

            return response_text

        except httpx.TimeoutException:
            raise Exception("Ollama request timed out.")
        except httpx.HTTPStatusError as e:
            raise Exception(f"Ollama request failed: {e.response.status_code}")
        except Exception as e:
            raise Exception(f"Failed to generate reply: {str(e)}")


REWORD_TEXT_PROMPT = """You are a professional editor. Reword the following text to improve clarity, grammar, and readability while preserving the original meaning and tone.

{context_section}

Text to reword:
---
{text}
---

Output ONLY the reworded text, no preamble or explanation."""


async def reword_text_content(text: str, context: str = "") -> str:
    """Reword text using Ollama LLM."""
    context_section = ""
    if context:
        context_section = f"Additional context:\n{context}\n"

    prompt = REWORD_TEXT_PROMPT.format(text=text, context_section=context_section)

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(
                f"{OLLAMA_HOST}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 2048,
                    }
                }
            )
            response.raise_for_status()

            result = response.json()
            response_text = result.get("response", "").strip()

            if response_text.startswith("```"):
                lines = response_text.split("\n")
                lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                response_text = "\n".join(lines).strip()

            return response_text

        except httpx.TimeoutException:
            raise Exception("Ollama request timed out.")
        except httpx.HTTPStatusError as e:
            raise Exception(f"Ollama request failed: {e.response.status_code}")
        except Exception as e:
            raise Exception(f"Failed to reword text: {str(e)}")


GENERATE_SECTION_PROMPT = """You are a technical documentation writer. Generate content for a document section.

Section name: {section_name}

{template_section}

Task context:
{task_context}

Write clear, well-structured markdown content for this section. Use appropriate formatting (headers, lists, code blocks) as needed.
Output ONLY the section content in markdown, no preamble or explanation."""


async def generate_section_content(section_name: str, template_context: str = "", task_context: str = "") -> str:
    """Generate content for a document section using Ollama LLM."""
    template_section = ""
    if template_context:
        template_section = f"Template/instructions:\n{template_context}\n"

    prompt = GENERATE_SECTION_PROMPT.format(
        section_name=section_name,
        template_section=template_section,
        task_context=task_context,
    )

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(
                f"{OLLAMA_HOST}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 2048,
                    }
                }
            )
            response.raise_for_status()

            result = response.json()
            response_text = result.get("response", "").strip()

            if response_text.startswith("```"):
                lines = response_text.split("\n")
                lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                response_text = "\n".join(lines).strip()

            return response_text

        except httpx.TimeoutException:
            raise Exception("Ollama request timed out.")
        except httpx.HTTPStatusError as e:
            raise Exception(f"Ollama request failed: {e.response.status_code}")
        except Exception as e:
            raise Exception(f"Failed to generate section: {str(e)}")


# Step 1: Ask the model for 1-2 iconic seed colors only — a simple lookup task
# that small models handle reliably. The full palette is derived algorithmically.
IDENTIFY_COLORS_PROMPT = """Identify the 1 or 2 most iconic hex colors for a UI theme based on this description.

For one dominant color, respond: {{"colors": ["#rrggbb"]}}
For two dominant colors (blend themes), respond: {{"colors": ["#rrggbb", "#rrggbb"]}}

Examples:
- "only blue" → {{"colors": ["#2563eb"]}}
- "st. patty's day" → {{"colors": ["#16a34a"]}}
- "fourth of july" → {{"colors": ["#dc2626", "#1d4ed8"]}}
- "christmas season" → {{"colors": ["#16a34a", "#dc2626"]}}
- "the incredible hulk" → {{"colors": ["#22c55e", "#7c3aed"]}}
- "australian outback" → {{"colors": ["#b45309"]}}
- "bronze, copper, and gold" → {{"colors": ["#d97706"]}}
- "tomato garden" → {{"colors": ["#dc2626"]}}
- "orange creamsicle" → {{"colors": ["#f97316"]}}
- "birthday cake ice cream" → {{"colors": ["#f472b6"]}}

Description: {prompt}

Respond with ONLY the JSON object, nothing else:"""


def _hex_to_hls(hex_color: str) -> tuple:
    """Convert a hex color to Python's (h, l, s) tuple."""
    import colorsys
    h = hex_color.lstrip('#').lower()
    r, g, b = int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0
    return colorsys.rgb_to_hls(r, g, b)  # returns (hue, lightness, saturation)


def _hls_to_hex(h: float, l: float, s: float) -> str:
    """Convert HLS floats to a lowercase hex color string."""
    import colorsys
    r, g, b = colorsys.hls_to_rgb(h, max(0.0, min(1.0, l)), max(0.0, min(1.0, s)))
    return f"#{int(round(r * 255)):02x}{int(round(g * 255)):02x}{int(round(b * 255)):02x}"


def _generate_palette_from_seeds(hex1: str, hex2: str = None) -> Dict[str, str]:
    """
    Algorithmically generate a full 18-color UI palette from 1–2 seed hex colors.

    For single-hue themes: uniform tint-to-shade ramp of hex1.
    For two-hue themes: hex1 at the light end (50–400), hex2 at the dark end (600–900).
    Surface, border, and text values are derived directly from the primary scale.
    """
    # Tailwind-inspired lightness distribution
    LIGHTNESS = [0.96, 0.92, 0.84, 0.72, 0.60, 0.46, 0.38, 0.30, 0.22, 0.15]
    PRIMARY_KEYS = [
        "primary-50", "primary-100", "primary-200", "primary-300", "primary-400",
        "primary-500", "primary-600", "primary-700", "primary-800", "primary-900",
    ]

    h1, _, s1 = _hex_to_hls(hex1)
    s1 = max(0.45, s1)  # Ensure minimum saturation for a vivid palette

    colors: Dict[str, str] = {}

    if hex2 is None:
        for i, key in enumerate(PRIMARY_KEYS):
            l = LIGHTNESS[i]
            # Slightly desaturate very light shades so they work as backgrounds
            s = s1 * (0.35 + 0.65 * min(1.0, (1.0 - l) / 0.5))
            colors[key] = _hls_to_hex(h1, l, s)
    else:
        h2, _, s2 = _hex_to_hls(hex2)
        s2 = max(0.45, s2)
        for i, key in enumerate(PRIMARY_KEYS):
            l = LIGHTNESS[i]
            if i <= 4:
                s = s1 * (0.35 + 0.65 * min(1.0, (1.0 - l) / 0.5))
                colors[key] = _hls_to_hex(h1, l, s)
            else:
                s = s2 * (0.35 + 0.65 * min(1.0, (1.0 - l) / 0.5))
                colors[key] = _hls_to_hex(h2, l, s)

    # Derive surface/border/text directly from the primary scale
    colors["surface"]           = colors["primary-50"]
    colors["surface-secondary"] = colors["primary-100"]
    colors["surface-tertiary"]  = colors["primary-200"]
    colors["border"]            = colors["primary-300"]
    colors["border-secondary"]  = colors["primary-200"]
    colors["text-primary"]      = colors["primary-900"]
    colors["text-secondary"]    = colors["primary-800"]
    colors["text-muted"]        = colors["primary-600"]

    return colors


def _is_valid_hex(value: str) -> bool:
    """Return True if value is a valid 6-digit hex color."""
    import re
    return bool(re.match(r'^#[0-9a-fA-F]{6}$', value.strip()))


# Themes with well-known, unambiguous color associations.
# These bypass the LLM entirely to guarantee correct results.
# Format: (keywords_any_match, [hex1, hex2_optional])
_CULTURAL_OVERRIDES: list = [
    (["christmas", "xmas"],                                         ["#16a34a", "#dc2626"]),
    (["st. patty", "st patty", "st. patrick", "st patrick",
      "saint patrick", "paddy's", "paddys"],                       ["#16a34a"]),
    (["fourth of july", "4th of july", "july 4", "july 4th",
      "independence day"],                                          ["#dc2626", "#1d4ed8"]),
    (["halloween"],                                                 ["#ea580c", "#1c1917"]),
    (["valentine's day", "valentines day", "valentine day"],        ["#dc2626", "#fce7f3"]),
    (["hanukkah", "chanukah"],                                      ["#1d4ed8", "#e2e8f0"]),
    (["thanksgiving"],                                              ["#c2410c", "#92400e"]),
    (["mardi gras"],                                                ["#7c3aed", "#16a34a"]),
    (["incredible hulk", "the hulk"],                               ["#22c55e", "#7c3aed"]),
    (["bronze", "copper", "gold"],                                  ["#d4a017"]),
]

# The LLM is only allowed to return a second seed color if the prompt
# contains one of these keywords. For all other prompts the second seed
# is ignored, preventing bad guesses (e.g. metals getting purple added).
_DUAL_HUE_KEYWORDS: set = {
    "sunset", "sunrise", "dawn", "dusk",
    "day and night", "night and day",
    "fire and ice", "ice and fire",
    "yin yang", "yin-yang",
    "ocean and", "and ocean",
    "hulk",
}


async def generate_theme_colors(prompt: str) -> Dict[str, Any]:
    """
    Generate a UI theme color palette from a text description.

    Uses a two-step approach:
      1. Check cultural override table (instant, no LLM needed for known themes).
      2. Otherwise ask the LLM for 1 seed hex color, then derive the full
         18-color palette algorithmically.
    """
    prompt_lower = prompt.lower()

    # --- Cultural override: bypass LLM for well-known themes ---
    for keywords, seeds in _CULTURAL_OVERRIDES:
        if any(kw in prompt_lower for kw in keywords):
            hex1 = seeds[0]
            hex2 = seeds[1] if len(seeds) > 1 else None
            colors = _generate_palette_from_seeds(hex1, hex2)
            return {"isDark": False, "colors": colors}

    # --- Determine if a second seed color should be accepted ---
    allow_dual = any(kw in prompt_lower for kw in _DUAL_HUE_KEYWORDS)

    formatted_prompt = IDENTIFY_COLORS_PROMPT.format(prompt=prompt)

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(
                f"{OLLAMA_HOST}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": formatted_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,
                        "num_predict": 64,
                    }
                }
            )
            response.raise_for_status()

            result = response.json()
            response_text = result.get("response", "").strip()

            # Strip markdown fences if present
            if response_text.startswith("```"):
                lines = response_text.split("\n")[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                response_text = "\n".join(lines).strip()

            start = response_text.find("{")
            end = response_text.rfind("}")
            if start == -1 or end <= start:
                raise Exception("No JSON object found in AI response")

            parsed = json.loads(response_text[start:end + 1])
            seed_colors = parsed.get("colors", [])

            if not seed_colors or not _is_valid_hex(seed_colors[0]):
                raise Exception(f"Invalid seed color returned: {seed_colors}")

            hex1 = seed_colors[0].strip().lower()
            hex2 = (
                seed_colors[1].strip().lower()
                if allow_dual and len(seed_colors) > 1 and _is_valid_hex(seed_colors[1])
                else None
            )

            colors = _generate_palette_from_seeds(hex1, hex2)
            is_dark = False  # Light theme by default

            return {"isDark": is_dark, "colors": colors}

        except httpx.TimeoutException:
            raise Exception("Ollama request timed out.")
        except httpx.HTTPStatusError as e:
            raise Exception(f"Ollama request failed: {e.response.status_code}")
        except json.JSONDecodeError:
            raise Exception("Failed to parse AI response as JSON")
        except Exception as e:
            raise Exception(f"Failed to generate theme: {str(e)}")


def validate_task(task: Any) -> Dict[str, Any] | None:
    """Validate and normalize a task object."""
    if not isinstance(task, dict):
        return None

    title = task.get("title", "").strip()
    if not title:
        return None

    validated = {"title": title}

    # Optional fields
    if task.get("description"):
        validated["description"] = str(task["description"]).strip()

    if task.get("dueDate"):
        validated["dueDate"] = str(task["dueDate"]).strip()

    if task.get("priority"):
        priority = str(task["priority"]).lower().strip()
        if priority in ["high", "medium", "low"]:
            validated["priority"] = priority

    return validated
