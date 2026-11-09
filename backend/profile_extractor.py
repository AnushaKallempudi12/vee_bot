import re
from typing import Optional


# Interview-relevant fields only. Never extract passport numbers, SEVIS IDs,
# DS-160 confirmation numbers, dates of birth, contact details, or home addresses.
ALLOWED_FIELDS = {
    "travel_purpose": ["purpose of trip", "purpose of trip to the us", "purpose of travel", "purpose of your trip to us", "purpose of visit"],
    "travel_duration": ["intended length of stay", "intended length of stay in us", "length of stay", "duration of trip"],
    "travel_destinations": ["locations you plan to visit", "cities you plan to visit", "places to be visited", "intended locations"],
    "trip_payer": ["person entity paying for your trip", "person company paying for your trip", "person paying for your trip", "who is paying for your trip", "payer of trip"],
    "university": ["name of institution", "name of school", "educational institution", "school name", "school"],
    "study_program": ["course of study", "field of study", "program of study", "major", "major 1", "primary major"],
    "degree_level": ["education level", "level of education", "program level", "degree level"],
    "employer": ["present employer or school name", "present employer", "employer name", "company name", "name of employer"],
    "job_title": ["job title", "occupation", "present occupation", "primary occupation"],
    "job_duties": ["briefly describe your duties", "describe your work duties", "job responsibilities"],
    "relationship_to_student": ["relationship to principal applicant", "relationship to student", "relationship to f1 student"],
    "funding_source": ["who will fund your studies", "source of funds", "how will you pay for your studies", "financial support"],
    "previous_education": ["previous education", "prior education", "previous school", "name of previous institution"],
}

NAME_LABELS = {
    "student name", "students name", "student s name", "applicant name", "full name",
    "surname primary name", "surname family name", "surname",
    "surnames", "given names", "given name", "first name",
}
DOCUMENT_MARKERS = {
    "I20": ("form i 20", "certificate of eligibility for nonimmigrant student status", "sevis school code"),
    "DS-160": ("ds 160", "online nonimmigrant visa application", "confirmation number"),
}


def normalize_label(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"\(\s*\d+\s*\)", "", value)
    value = re.sub(r"[^a-z0-9 ]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


LABEL_LOOKUP = {
    normalize_label(label): field_name
    for field_name, labels in ALLOWED_FIELDS.items()
    for label in labels
}

SENSITIVE_PATTERNS = [
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    re.compile(r"\b[A-Z]\d{8}\b", re.I),
    re.compile(r"\b\d{8,}\b"),
    re.compile(r"\b\d{2}/\d{2}/\d{4}\b"),
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
    re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b"),
    re.compile(r"\b(?:\+?\d[\d\s().-]{7,}\d)\b"),
]


def contains_sensitive_pattern(value: str) -> bool:
    return any(pattern.search(value) for pattern in SENSITIVE_PATTERNS)


def clean_candidate(value: str, allow_name: bool = False) -> Optional[str]:
    value = re.sub(r"[\x00-\x1f\x7f]", " ", value)
    value = re.sub(r"\s+", " ", value).strip(" :|-\t")
    if not value or len(value) > 180:
        return None
    if contains_sensitive_pattern(value):
        return None
    if value.upper() in {"DOES NOT APPLY", "DO NOT KNOW", "NONE", "N/A", "YES", "NO"}:
        return None
    # Names are permitted only when extracted next to an explicit name label.
    if allow_name and not re.search(r"[A-Za-z]", value):
        return None
    return value


def _next_value(lines: list[str], index: int) -> Optional[str]:
    for candidate in lines[index + 1:index + 3]:
        # Avoid consuming another label as a value.
        if normalize_label(candidate) in LABEL_LOOKUP or normalize_label(candidate) in NAME_LABELS:
            return None
        cleaned = clean_candidate(candidate)
        if cleaned:
            return cleaned
    return None


def extract_profile(text: str) -> dict:
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]
    normalized_text = normalize_label(" ".join(lines))
    profile = {}

    for document_type, markers in DOCUMENT_MARKERS.items():
        if any(normalize_label(marker) in normalized_text for marker in markers):
            profile["document_type"] = document_type
            break

    name_parts = {}
    for index, line in enumerate(lines):
        # Common PDF text extraction layouts: "Label: Value" or label/value on adjacent lines.
        if ":" in line:
            label, candidate = line.split(":", 1)
        else:
            label, candidate = line, ""

        normalized_label = normalize_label(label)
        if normalized_label in NAME_LABELS:
            value = clean_candidate(candidate, allow_name=True) if candidate else None
            if not value:
                value = _next_value(lines, index)
            if value:
                if normalized_label in {"surnames", "surname", "surname primary name", "surname family name"}:
                    name_parts["surname"] = value
                elif normalized_label in {"given names", "given name", "first name"}:
                    name_parts["given"] = value
                else:
                    profile.setdefault("applicant_name", value)
            continue

        field_name = LABEL_LOOKUP.get(normalized_label)
        if field_name and field_name not in profile:
            value = clean_candidate(candidate) if candidate else None
            if not value:
                value = _next_value(lines, index)
            if value:
                profile[field_name] = value

    if "applicant_name" not in profile and (name_parts.get("given") or name_parts.get("surname")):
        profile["applicant_name"] = " ".join(
            part for part in (name_parts.get("given"), name_parts.get("surname")) if part
        )

    return profile
