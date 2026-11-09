import re
from typing import Optional


# Interview-relevant fields only. Never extract passport numbers, SSNs, SEVIS IDs,
# DS-160 confirmation numbers, dates of birth, personal contact details, or home addresses.
# The intended U.S. stay address is intentionally included for visitor interview verification.
ALLOWED_FIELDS = {
    "travel_purpose": ["purpose of trip", "purpose of trip to the us", "purpose of trip to the u s", "purpose of travel", "purpose of your trip to us", "purpose of visit"],
    "travel_duration": ["intended length of stay", "intended length of stay in us", "length of stay", "duration of trip"],
    "us_stay_address": ["address where you will stay in the us", "address where you will stay in the u s", "address where you will stay in u s", "address where you will stay in us", "address where you will stay", "address in the united states where you will stay"],
    "us_contact_name": ["contact person name in the us", "contact person name in the united states", "us point of contact name", "point of contact name"],
    "us_contact_address": ["address of point of contact", "us point of contact address", "contact person address in the us", "address of contact person in the united states"],
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
    "travel_companions": ["persons traveling with you", "persons traveling with you to the us", "traveling with you", "other persons traveling with you"],
    "us_contact_organization": ["organization name in the united states", "us point of contact organization", "name of company or organization"],
    "us_contact_relationship": ["relationship to you", "relationship to applicant", "relationship to you in the united states"],
    "current_occupation": ["current occupation"],
    "work_location": ["work location", "intended work location", "place of employment"],
}

NAME_LABELS = {
    "student name", "students name", "student s name", "applicant name", "full name",
    "surname primary name", "surname family name", "surname", "name provided",
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
    if not value or len(value) > 250:
        return None
    if allow_name:
        value = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ ,.'-]", "", value).strip()
        if not value:
            return None
    if contains_sensitive_pattern(value):
        return None
    if value.upper() in {"DOES NOT APPLY", "DO NOT KNOW", "NONE", "N/A", "YES", "NO"}:
        return None
    # Names are permitted only when extracted next to an explicit name label.
    if allow_name and not re.search(r"[A-Za-z]", value):
        return None
    return value


def _is_label_line(line: str) -> bool:
    normalized = normalize_label(line)
    if normalized in LABEL_LOOKUP or normalized in NAME_LABELS:
        return True
    return any(normalized.startswith(label + " ") for label in (*LABEL_LOOKUP.keys(), *NAME_LABELS) if len(label) >= 5)


def _value_after_label(line: str, labels: set[str]):
    normalized = normalize_label(line)
    for label in sorted(labels, key=len, reverse=True):
        if normalized == label:
            return label, None
        if normalized.startswith(label + " "):
            label_pattern = r"^\s*" + r"[\W_]*".join(re.escape(word) for word in label.split()) + r"[\W_]*"
            remainder = re.sub(label_pattern, "", line, count=1, flags=re.I).strip(" :|\t-")
            return label, remainder or None
    return None, None


def _next_value(lines: list[str], index: int) -> Optional[str]:
    collected = []
    for candidate in lines[index + 1:index + 5]:
        if _is_label_line(candidate):
            break
        cleaned = clean_candidate(candidate)
        if cleaned:
            collected.append(cleaned)
        if len(" ".join(collected)) >= 250:
            break
    return clean_candidate(" ".join(collected))

def detect_visa_category(text: str, document_type: Optional[str] = None) -> dict:
    """Detect explicit visa classes only; ambiguous forms require applicant confirmation."""
    normalized = normalize_label(text)
    admission = re.search(r"class of admission\s*(?:[:\-]\s*)?f\s*[- ]?([12])\b", normalized, re.I)
    if admission:
        return {"detected_visa_type": "F1" if admission.group(1) == "1" else "F2", "visa_detection_confidence": "high"}
    explicit = re.search(r"(?:visa class|visa category|class of visa|visa type)\s*(?:is|:)?\s*(b\s*1\s*b\s*2|h\s*1\s*b|h\s*4|f\s*1|f\s*2)\b", normalized, re.I)
    if explicit:
        token = re.sub(r"[^A-Z0-9]", "", explicit.group(1).upper())
        mapping = {"B1B2": "B1/B2", "H1B": "H1B", "H4": "H4", "F1": "F1", "F2": "F2"}
        if token in mapping:
            return {"detected_visa_type": mapping[token], "visa_detection_confidence": "high"}
    if "spouse child of an f1 student" in normalized or "dependent of an f1 student" in normalized:
        return {"detected_visa_type": "F2", "visa_detection_confidence": "high"}
    if "dependent of an h1b" in normalized or "spouse of an h1b" in normalized or "spouse child of an h1b" in normalized:
        return {"detected_visa_type": "H4", "visa_detection_confidence": "high"}
    if "temporary business or pleasure visitor" in normalized or "temp business or pleasure visitor" in normalized:
        return {"detected_visa_type": "B1/B2", "visa_detection_confidence": "high"}
    if "academic or language student" in normalized:
        return {"detected_visa_type": "F1", "visa_detection_confidence": "high"}
    if "temporary worker in a specialty occupation" in normalized or "temporary worker in specialty occupation" in normalized:
        return {"detected_visa_type": "H1B", "visa_detection_confidence": "high"}
    if "temporary worker" in normalized:
        return {"detected_visa_type": None, "visa_detection_confidence": "ambiguous"}
    return {"detected_visa_type": None, "visa_detection_confidence": "unknown"}

def extract_profile(text: str) -> dict:
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]
    normalized_text = normalize_label(" ".join(lines))
    profile = {}

    for document_type, markers in DOCUMENT_MARKERS.items():
        if any(normalize_label(marker) in normalized_text for marker in markers):
            profile["document_type"] = document_type
            break

    name_parts = {}
    all_labels = set(LABEL_LOOKUP.keys()) | NAME_LABELS
    for index, line in enumerate(lines):
        label, candidate = line.split(":", 1) if ":" in line else (line, "")
        normalized_label = normalize_label(label)
        inline_candidate = candidate.strip() or None
        if normalized_label not in all_labels:
            matched, remainder = _value_after_label(line, all_labels)
            if matched:
                normalized_label, inline_candidate = matched, remainder

        if normalized_label in NAME_LABELS:
            value = clean_candidate(inline_candidate, allow_name=True) if inline_candidate else None
            if value and normalize_label(value) in {
                "first name", "given name", "given names", "family name",
                "primary name", "surname", "last name"
            }:
                value = None
            if not value:
                value = _next_value(lines, index)
            if value and normalize_label(value) in {
                "first name", "given name", "given names", "family name",
                "primary name", "surname", "last name"
            }:
                value = None
            if value:
                # DS-160 commonly prints Name Provided as SURNAME, GIVEN NAME.
                # Keep only the applicant's given/first name for the interview greeting.
                if normalized_label == "name provided" and "," in value:
                    given_name = value.split(",", 1)[1].strip().split()
                    value = given_name[0] if given_name else None
                if value and normalized_label in {"surnames", "surname", "surname primary name", "surname family name"}:
                    name_parts["surname"] = value
                elif normalized_label in {"given names", "given name", "first name"}:
                    name_parts["given"] = value
                else:
                    profile.setdefault("applicant_name", value)
            continue

        field_name = LABEL_LOOKUP.get(normalized_label)
        if field_name and field_name not in profile:
            value = clean_candidate(inline_candidate) if inline_candidate else None
            if not value:
                value = _next_value(lines, index)
            if value:
                profile[field_name] = value
    if "applicant_name" not in profile and (name_parts.get("given") or name_parts.get("surname")):
        profile["applicant_name"] = " ".join(
            part for part in (name_parts.get("given"), name_parts.get("surname")) if part
        )

    # Preserve the full reviewed name; the interview greeting uses its first token.
    if profile.get("applicant_name"):
        profile["applicant_name"] = re.sub(r"\s+", " ", profile["applicant_name"]).strip()

    return profile
