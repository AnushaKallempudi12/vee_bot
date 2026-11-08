
import re
from typing import Optional


# Only these fields are eligible for extraction.
# Names, addresses, passport details, contact information,
# dates of birth, and government identifiers are excluded.

ALLOWED_FIELDS = {
    "travel_purpose": [
        "purpose of trip",
        "purpose of travel",
        "purpose of your trip to us",
        "purpose",
    ],
   "travel_duration": [
    "intended length of stay",
    "intended length of stay in us",
    "intended length of stay in u s",
    "length of stay",
    "duration of trip",
],
    "travel_destinations": [
        "locations you plan to visit",
        "cities you plan to visit",
        "places to be visited",
    ],
    "trip_payer": [
        "person entity paying for your trip",
        "person paying for your trip",
        "who is paying for your trip",
        "payer of trip",
    ],
    "university": [
        "name of institution",
        "name of school",
        "educational institution",
    ],
    "study_program": [
        "course of study",
        "field of study",
        "program of study",
    ],
    "employer": [
        "present employer or school name",
        "present employer",
        "employer name",
        "company name",
    ],
    "job_title": [
        "job title",
        "occupation",
        "present occupation",
        "primary occupation",
    ],
    "job_duties": [
        "briefly describe your duties",
        "describe your work duties",
        "job responsibilities",
    ],
    "relationship_to_student": [
        "relationship to principal applicant",
        "relationship to student",
        "relationship to f1 student",
    ],
}


def normalize_label(value: str) -> str:
    value = value.lower().strip()

    # Remove numbering such as (1), (2), etc.
    value = re.sub(r"\(\s*\d+\s*\)", "", value)

    # Remove punctuation and normalize whitespace.
    value = re.sub(r"[^a-z0-9 ]", " ", value)
    value = re.sub(r"\s+", " ", value)

    return value.strip()


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
    return any(
        pattern.search(value)
        for pattern in SENSITIVE_PATTERNS
    )


def clean_candidate(value: str) -> Optional[str]:
    value = re.sub(r"[\x00-\x1f\x7f]", " ", value)
    value = re.sub(r"\s+", " ", value).strip()

    if not value or len(value) > 160:
        return None

    if contains_sensitive_pattern(value):
        return None

    # Avoid returning blank or non-informative answers.
    if value.upper() in {
        "DOES NOT APPLY",
        "DO NOT KNOW",
        "NONE",
        "N/A",
        "YES",
        "NO",
    }:
        return None

    return value


def extract_profile(text: str) -> dict:
    profile = {}

    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    for index, line in enumerate(lines):

        # Format 1: Label: Answer
        if ":" in line:
            label, candidate = line.split(":", 1)

            normalized_label = normalize_label(label)
            field_name = LABEL_LOOKUP.get(normalized_label)

            if field_name and field_name not in profile:
                cleaned = clean_candidate(candidate)

                if cleaned:
                    profile[field_name] = cleaned
                    continue

                # If the answer is on the next line,
                # use the next non-empty line.
                for next_line in lines[index + 1:]:
                    cleaned = clean_candidate(next_line)

                    if cleaned:
                        profile[field_name] = cleaned

                    break

                continue

        # Format 2: Label on one line, answer on next line.
        normalized = normalize_label(line)
        field_name = LABEL_LOOKUP.get(normalized)

        if field_name and field_name not in profile:

            if index + 1 < len(lines):
                cleaned = clean_candidate(lines[index + 1])

                if cleaned:
                    profile[field_name] = cleaned

    return profile
