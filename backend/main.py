import os
import re
import json
import asyncio
import fitz
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal, Optional

from profile_extractor import extract_profile


# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_TEXT_MODEL = os.getenv("GEMINI_TEXT_MODEL", "gemini-3.8-flash")

app = FastAPI(
    title="Riya AI API",
    description="Backend services for Riya AI visa interview practice",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://anushakallempudi12.github.io"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_PDF_PAGES = 20

try:
    SESSION_DURATION_MINUTES = max(
        5,
        min(60, int(os.getenv("RIYA_INTERVIEW_DURATION_MINUTES", "15")))
    )
except ValueError:
    SESSION_DURATION_MINUTES = 15

VISA_TYPES = Literal["F1", "F2", "B1/B2", "H1B", "H4"]


# --------------------------------------------------
# DATA MODELS
# --------------------------------------------------

class InterviewSetup(BaseModel):
    visa_type: VISA_TYPES
    language: Literal["English"]
    prep_mode: Literal["questions", "document"]
    document_selected: bool = False


class ConversationTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class InterviewChatRequest(BaseModel):
    visa_type: VISA_TYPES
    user_message: str = Field(default="", max_length=4000)
    history: list[ConversationTurn] = Field(
    default_factory=list,
    max_length=200
)
    profile: Optional[dict] = None
    start_interview: bool = False
    end_interview: bool = False


class InterviewAIResponse(BaseModel):
    assistant_message: str
    topic: str
    interview_complete: bool


class FeedbackRequest(BaseModel):
    visa_type: VISA_TYPES
    history: list[ConversationTurn] = Field(
        min_length=1,
        max_length=200
    )
    profile: Optional[dict] = None


class InterviewFeedback(BaseModel):
    overall_summary: str
    strengths: list[str]
    improvement_areas: list[str]
    practice_tips: list[str]
    consistency_notes: list[str]
    disclaimer: str


# --------------------------------------------------
# PRIVACY FILTERING
# --------------------------------------------------

SENSITIVE_PATTERNS = [
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    re.compile(r"\b[A-Z]\d{8}\b", re.I),
    re.compile(r"\b\d{8,}\b"),
    re.compile(r"\b\d{2}/\d{2}/\d{4}\b"),
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
    re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b"),
    re.compile(r"\b(?:\+?\d[\d\s().-]{7,}\d)\b"),
]

ALLOWED_PROFILE_FIELDS = {
    "travel_purpose",
    "travel_duration",
    "travel_destinations",
    "trip_payer",
    "university",
    "study_program",
    "employer",
    "job_title",
    "job_duties",
    "relationship_to_student",
}


def sanitize_text(value: str) -> str:
    """Redact common sensitive patterns before sending text to the AI provider."""

    value = re.sub(r"[\x00-\x1f\x7f]", " ", value)

    for pattern in SENSITIVE_PATTERNS:
        value = pattern.sub("[REDACTED]", value)

    return value[:4000].strip()


def sanitize_profile(profile: Optional[dict]) -> dict:
    """Only accept approved, user-reviewed profile fields."""

    if not isinstance(profile, dict):
        return {}

    safe_profile = {}

    for key, value in profile.items():
        if key not in ALLOWED_PROFILE_FIELDS:
            continue

        if not isinstance(value, str):
            continue

        cleaned = sanitize_text(value)

        if cleaned:
            safe_profile[key] = cleaned[:300]

    return safe_profile


def sanitize_history(history: list[ConversationTurn]) -> list[dict]:
    safe_history = []

    for turn in history[-200:]:
        content = sanitize_text(turn.content)

        if content:
            safe_history.append({
                "role": turn.role,
                "content": content
            })

    return safe_history


# --------------------------------------------------
# VISA-SPECIFIC INTERVIEW INSTRUCTIONS
# --------------------------------------------------

VISA_INSTRUCTIONS = {
    "F1": """
You are interviewing an applicant practicing for an F1 student visa.

Explore topics naturally, including:
- Why the applicant wants to study in the United States.
- Why they selected their university and program.
- Their academic background.
- Their understanding of the course.
- Tuition, funding, and financial support.
- Their plans after completing their studies.
- Their reasons for choosing the United States.

Ask about relevant details based on previous answers.
""",

    "F2": """
You are interviewing an applicant practicing for an F2 dependent visa.

The applicant is NOT the F1 student.

Explore topics naturally, including:
- Their relationship to the principal F1 student.
- How and when the relationship began, when relevant.
- The F1 student's university and program.
- The F1 student's current or intended student status.
- Why the applicant wants to accompany or join the student.
- Intended duration and living arrangements.
- Financial support for the dependent.
- Plans during the stay and ties outside the United States.

Do not ask the F2 applicant to explain their own F1 course of study.
Ask relevant follow-up questions when answers are unclear.
""",

    "B1/B2": """
You are interviewing an applicant practicing for a B1/B2 visitor visa.

Explore topics naturally, including:
- Purpose of the visit.
- Planned activities and destinations.
- Intended duration.
- Who will pay for the trip.
- Employment, education, or other circumstances outside the United States.
- Reasons for returning after the visit.
- Relevant travel history, when appropriate.

Distinguish business visitor purposes from tourism or personal visits.
""",

    "H1B": """
You are interviewing an applicant practicing for an H1B work visa.

Explore topics naturally, including:
- The sponsoring employer and how the applicant learned about the opportunity.
- Job title, day-to-day responsibilities, and work location.
- The applicant's education, qualifications, and relevant experience.
- How the applicant's background relates to the offered role.
- Compensation and employment arrangements, when relevant.
- The applicant's understanding of the position and employer.

Ask follow-up questions when an answer is vague or inconsistent. Do not invent employer details or legal requirements.
""",

    "H4": """
You are interviewing an applicant practicing for an H4 dependent visa.

Explore topics naturally, including:
- The applicant's relationship to the principal H1B visa holder.
- The principal applicant's employer, job title, work location, and current work situation.
- How and when the applicant plans to accompany or join the principal applicant.
- Intended living arrangements and expected duration of stay.
- How the household will be financially supported.
- The applicant's own circumstances and plans during the stay.
- Relevant family and travel context.

Address the applicant as the H4 dependent, not as the H1B worker. Ask follow-up questions when details are unclear. Do not invent facts or legal requirements.
"""
}


def build_system_instruction(visa_type: str, profile: dict) -> str:
    visa_context = VISA_INSTRUCTIONS[visa_type]

    profile_context = json.dumps(profile, ensure_ascii=False)

    return f"""
You are Riya, a friendly, professional U.S. visa mock-interview assistant.

PERSONALITY:
- Warm, natural, calm, and professional.
- Speak like a real interviewer having a conversation.
- Use clear, simple English.
- Ask only ONE question at a time.
- Do not sound robotic or repeat scripted introductions.

INTERVIEW RULES:
- Start by introducing yourself as Riya.
- Ask the applicant what name they prefer to be called.
- Conduct a realistic practice interview.
- Conduct a time-bounded mock interview; the application controls the session duration and ends the session when time expires.
- Adapt every next question to the applicant's previous answer and the selected visa category.
- Choose questions dynamically; never follow a fixed script or predetermined question sequence.
- Ask natural follow-up questions when answers are vague, incomplete, or need clarification.
- Explore a varied range of relevant visa-specific topics over the session without forcing every topic into every interview.
- Use the reviewed document profile as context when available; verify important details conversationally rather than assuming extracted fields are correct.
- Avoid repeating questions already answered unless clarification is genuinely needed.
- Do not provide feedback after every answer unless the applicant requests it.
- Do not end the interview yourself based only on the number of questions or topics covered; the application controls the time limit and the applicant may also ask to stop.
- Never tell an applicant to fabricate information or hide relevant facts.
- Never guarantee visa approval or predict the actual consular decision.
- You are a practice assistant, not an immigration lawyer or government official.

SELECTED VISA CATEGORY: {visa_type}

VISA-SPECIFIC GUIDANCE:
{visa_context}

USER-REVIEWED PROFILE:
{profile_context}

Use profile details only as background context.
If a detail is missing, ask the applicant naturally.
Never assume that a missing detail is true.

Return a concise response with one question at a time.
The interview_complete field must remain false during the conversation.
"""


# --------------------------------------------------
# GEMINI TEXT HELPER
# --------------------------------------------------

async def generate_gemini_response(input_items, instructions: str, response_model):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Riya's AI backend is not configured. Add GEMINI_API_KEY to Railway variables.")

    contents = []
    for item in input_items:
        role = "model" if item["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": item["content"]}]})

    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_TEXT_MODEL}:generateContent"
    payload = {
        "systemInstruction": {"parts": [{"text": instructions}]},
        "contents": contents,
        "generationConfig": {
            "responseMimeType": "application/json",
            "maxOutputTokens": 1200,
            "temperature": 0.7
        }
    }

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await asyncio.wait_for(
                client.post(endpoint, params={"key": GEMINI_API_KEY}, json=payload),
                timeout=45
            )

        if not response.is_success:
            print(f"GEMINI TEXT ERROR: status={response.status_code}, body={response.text[:1500]}", flush=True)
            if response.status_code == 429:
                raise HTTPException(status_code=429, detail="Riya has reached the Gemini free-tier usage limit. Please wait and try again later.")
            if response.status_code in (401, 403):
                raise HTTPException(status_code=503, detail="Gemini rejected the API key or model access. Check GEMINI_API_KEY and the selected model in Railway.")
            raise HTTPException(status_code=502, detail="Gemini could not complete the request. Please try again.")

        result = response.json()
        parts = result.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        output_text = "".join(part.get("text", "") for part in parts).strip()
        if not output_text:
            raise HTTPException(status_code=502, detail="Gemini returned an empty response. Please try again.")

        return response_model.model_validate_json(output_text)

    except HTTPException:
        raise
    except (asyncio.TimeoutError, httpx.TimeoutException):
        raise HTTPException(status_code=504, detail="Riya's response took too long. Please try again.")
    except Exception as error:
        print("GEMINI TEXT ERROR:", repr(error), flush=True)
        raise HTTPException(status_code=502, detail="The AI service could not complete the request. Please try again.")


def build_conversation_input(history: list[dict], current_message: str):
    input_items = []
    applicant_has_spoken = False
    for turn in history[-200:]:
        if turn["role"] == "assistant" and not applicant_has_spoken:
            continue
        if turn["role"] == "user":
            applicant_has_spoken = True
        input_items.append({"role": turn["role"], "content": turn["content"]})
    if current_message:
        input_items.append({"role": "user", "content": current_message})
    return input_items


# INTERVIEW END DETECTION
# --------------------------------------------------

END_PHRASES = [
    "end the interview",
    "stop the interview",
    "finish the interview",
    "i am done",
    "i'm done",
    "i am finished",
    "i'm finished",
    "that's all",
    "that is all",
    "no more questions",
    "i want to stop",
    "let's stop",
    "lets stop",
]


def user_wants_to_end(message: str) -> bool:
    normalized = message.lower().strip()

    return any(
        phrase in normalized
        for phrase in END_PHRASES
    )


# --------------------------------------------------
# BASIC ENDPOINTS
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "Welcome to Riya AI backend",
        "status": "running",
        "ai_provider": "Google Gemini"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Riya AI API",
        "gemini_configured": bool(GEMINI_API_KEY),
        "text_model": GEMINI_TEXT_MODEL,
        "voice_mode": "browser_speech_recognition_and_synthesis",
        "session_duration_minutes": SESSION_DURATION_MINUTES
    }


@app.post("/api/interview/setup")
def create_interview_setup(setup: InterviewSetup):
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Riya's AI backend is not configured. Add GEMINI_API_KEY to Railway variables."
        )

    if setup.prep_mode == "document" and not setup.document_selected:
        raise HTTPException(
            status_code=400,
            detail="Select a PDF or choose questions-only preparation."
        )

    return {
        "status": "success",
        "message": "Interview setup received successfully.",
        "setup": setup.model_dump(),
        "document_processing": "existing",
        "interview_ai": "configured",
        "session_duration_minutes": SESSION_DURATION_MINUTES
    }


# --------------------------------------------------
# TEXT-BASED INTERVIEW CHAT (VOICE HANDLED BY THE BROWSER)
# --------------------------------------------------

@app.post("/api/interview/chat")
async def interview_chat(request: InterviewChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Gemini is not configured."
        )

    if not request.start_interview and not request.end_interview:
        if not request.user_message.strip():
            raise HTTPException(
                status_code=400,
                detail="A user message is required."
            )

    if request.end_interview or user_wants_to_end(request.user_message):
        return {
            "status": "success",
            "assistant_message": (
                "Of course! Thank you for practicing with me. "
                "Let's finish your interview and review your answers."
            ),
            "topic": "interview_finished",
            "interview_complete": True,
            "feedback_available": True
        }

    safe_profile = sanitize_profile(request.profile)
    safe_history = sanitize_history(request.history)

    if request.start_interview:
        current_message = (
            "Start the mock interview now. Introduce yourself as Riya "
            "and ask the applicant what name they prefer to be called. "
            "Do not ask any other question in this first response."
        )
    else:
        current_message = sanitize_text(request.user_message)

    input_items = build_conversation_input(safe_history, current_message)
    system_instruction = build_system_instruction(
        request.visa_type,
        safe_profile
    )

    ai_result = await generate_gemini_response(
        input_items,
        system_instruction,
        InterviewAIResponse
    )

    return {
        "status": "success",
        "assistant_message": ai_result.assistant_message,
        "topic": ai_result.topic,
        "interview_complete": False,
        "feedback_available": False
    }


# --------------------------------------------------
# FINAL INTERVIEW FEEDBACK
# --------------------------------------------------

@app.post("/api/interview/feedback")
async def interview_feedback(request: FeedbackRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Gemini is not configured."
        )

    safe_history = sanitize_history(request.history)
    safe_profile = sanitize_profile(request.profile)

    if not safe_history:
        raise HTTPException(
            status_code=400,
            detail="No interview answers were provided."
        )

    conversation_text = "\n".join(
        f"{turn['role'].upper()}: {turn['content']}"
        for turn in safe_history
    )

    feedback_instruction = f"""
You are Riya, evaluating a completed {request.visa_type} visa
mock interview.

Review the applicant's answers and provide constructive practice feedback.

Evaluate:
- Relevance to the questions.
- Clarity and completeness.
- Specificity of explanations.
- Internal consistency across answers.
- Areas where the applicant could prepare better.

Do not judge accent, personality, or confidence from text.
Do not invent contradictions.
If there is not enough information to assess something, say so.
Do not predict visa approval or rejection.
Do not provide legal advice.
Do not recommend fabricating information.

USER-REVIEWED PROFILE:
{json.dumps(safe_profile, ensure_ascii=False)}

INTERVIEW CONVERSATION:
{conversation_text}

Keep feedback practical, respectful, and specific.
"""

    feedback = await generate_gemini_response(
        [{"role": "user", "content": "Evaluate this completed mock interview."}],
        feedback_instruction,
        InterviewFeedback
    )

    return {
        "status": "success",
        "interview_complete": True,
        "feedback": feedback.model_dump()
    }


# --------------------------------------------------
# EXISTING PDF ENDPOINTS
# --------------------------------------------------

@app.post("/api/documents/inspect")
async def inspect_document(file: UploadFile = File(...)):

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file."
        )

    if file.content_type not in (
        "application/pdf",
        "application/octet-stream"
    ):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload a PDF."
        )

    try:
        pdf_bytes = await file.read(MAX_FILE_SIZE + 1)

        if len(pdf_bytes) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="PDF must be 10 MB or smaller."
            )

        if not pdf_bytes.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is not a valid PDF."
            )

        try:
            document = fitz.open(
                stream=pdf_bytes,
                filetype="pdf"
            )
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="The PDF could not be opened. Please check the file."
            )

        try:
            if document.needs_pass:
                raise HTTPException(
                    status_code=400,
                    detail="Password-protected PDFs are not supported."
                )

            page_count = document.page_count

            if page_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail="The PDF does not contain any pages."
                )

            if page_count > MAX_PDF_PAGES:
                raise HTTPException(
                    status_code=413,
                    detail=f"PDF cannot contain more than {MAX_PDF_PAGES} pages."
                )

            extracted_text = "\n".join(
                page.get_text("text") for page in document
            )

            character_count = len(extracted_text.strip())

            extraction_status = (
                "no_text_detected"
                if character_count == 0
                else "text_detected"
            )

            del extracted_text

            return {
                "status": "success",
                "message": "PDF validation completed.",
                "page_count": page_count,
                "extraction_status": extraction_status,
                "text_characters_detected": character_count,
                "stored_permanently": False,
                "sent_to_ai": False,
                "ocr_available": False
            }

        finally:
            document.close()

    finally:
        await file.close()


@app.post("/api/documents/profile-preview")
async def preview_document_profile(
    visa_type: VISA_TYPES,
    file: UploadFile = File(...)
):

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file."
        )

    if file.content_type not in (
        "application/pdf",
        "application/octet-stream"
    ):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type."
        )

    try:
        pdf_bytes = await file.read(MAX_FILE_SIZE + 1)

        if len(pdf_bytes) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="PDF must be 10 MB or smaller."
            )

        if not pdf_bytes.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=400,
                detail="Invalid PDF file."
            )

        try:
            document = fitz.open(
                stream=pdf_bytes,
                filetype="pdf"
            )
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Unable to open this PDF."
            )

        try:
            if document.needs_pass:
                raise HTTPException(
                    status_code=400,
                    detail="Password-protected PDFs are not supported."
                )

            if document.page_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail="The PDF has no pages."
                )

            if document.page_count > MAX_PDF_PAGES:
                raise HTTPException(
                    status_code=413,
                    detail=f"Maximum allowed pages: {MAX_PDF_PAGES}."
                )

            extracted_text = "\n".join(
                page.get_text("text") for page in document
            )

            profile = extract_profile(extracted_text)

            del extracted_text

            return {
                "status": "success",
                "message": "Preliminary profile extraction completed.",
                "visa_type": visa_type,
                "profile": profile,
                "review_required": True,
                "stored_permanently": False,
                "sent_to_ai": False,
                "extraction_method": "allowlisted_text_matching",
                "security_note": (
                    "Pattern screening is not a guarantee of complete "
                    "sensitive-data removal. Review all fields before use."
                )
            }

        finally:
            document.close()

    finally:
        await file.close()