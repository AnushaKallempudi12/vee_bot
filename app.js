
// ==================================================
// RIYA AI - DYNAMIC GEMINI INTERVIEW FRONTEND
// ==================================================

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const BACKEND_URL = "http://127.0.0.1:8000";

// ==================================================
// HTML ELEMENTS
// ==================================================

const app = $("#appShell");
const setup = $("#setupPanel");
const profileReview = $("#profileReviewPanel");
const interview = $("#interviewPanel");
const complete = $("#completePanel");
const profileFields = $("#profileFields");
const profileEmptyMessage = $("#profileEmptyMessage");
const toast = $("#toast");

// ==================================================
// APPLICATION STATE
// ==================================================

let visa = "F1";
let language = "English";
let prep = "questions";
let file = null;

let extractedProfile = {};
let interviewHistory = [];

let recognition = null;
let recording = false;
let currentTranscript = "";
let currentQuestion = "";
let selectedVoiceURI = "";

let requestInProgress = false;
let interviewActive = false;
let endingInterview = false;
let recognitionShouldSubmit = false;

// ==================================================
// PROFILE FIELD LABELS
// ==================================================

const profileLabels = {
    travel_purpose: "Purpose of travel",
    travel_duration: "Travel duration",
    travel_destinations: "Travel destinations",
    trip_payer: "Who pays for the trip",
    university: "University",
    study_program: "Study program",
    employer: "Employer",
    job_title: "Job title",
    job_duties: "Job duties",
    relationship_to_student: "Relationship to F1 student"
};

const profileAliases = {
    purpose_of_travel: "travel_purpose",
    purpose_of_visit: "travel_purpose",
    travel_purpose: "travel_purpose",

    intended_length_of_stay: "travel_duration",
    length_of_stay: "travel_duration",
    duration_of_stay: "travel_duration",
    travel_duration: "travel_duration",

    destination: "travel_destinations",
    destinations: "travel_destinations",
    travel_destinations: "travel_destinations",

    who_pays: "trip_payer",
    payer: "trip_payer",
    trip_payer: "trip_payer",

    school_name: "university",
    institution: "university",
    university_name: "university",
    university: "university",

    course_of_study: "study_program",
    program: "study_program",
    study_program: "study_program",

    employer_name: "employer",
    employer: "employer",

    position: "job_title",
    job_title: "job_title",

    job_description: "job_duties",
    job_duties: "job_duties",

    relationship: "relationship_to_student",
    relationship_to_student: "relationship_to_student"
};

// ==================================================
// GENERAL HELPERS
// ==================================================

function notify(message) {
    if (!toast) {
        console.warn(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(notify.timer);

    notify.timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function addClick(selector, callback) {
    const element = $(selector);

    if (!element) {
        console.warn("HTML element not found:", selector);
        return;
    }

    element.addEventListener("click", callback);
}

function updateStep(number, total = "03") {
    const stepLabel = $("#stepLabel");
    const totalSteps = $("#totalSteps");

    if (stepLabel) stepLabel.textContent = number;
    if (totalSteps) totalSteps.textContent = total;
}

function setState(state, label) {
    $$(".mascot-stage").forEach(element => {
        element.dataset.state = state;
    });

    const status = $("#riyaStatus");

    if (status) {
        status.textContent = label;
    }
}

async function backendRequest(endpoint, data) {
    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    });

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error("The backend returned an invalid response.");
    }

    if (!response.ok) {
        throw new Error(
            result.detail ||
            result.message ||
            `Request failed (${response.status}).`
        );
    }

    return result;
}

// ==================================================
// BROWSER VOICE ENGINE
// ==================================================

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

function stopRiyaSpeaking() {
    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }
}

function getAvailableVoices() {
    if (!("speechSynthesis" in window)) return [];

    return window.speechSynthesis.getVoices();
}

function setupVoiceSelector() {
    const interviewPanel = $("#interviewPanel");

    if (!interviewPanel) return;

    let container = $("#riyaVoiceControls");

    if (!container) {
        container = document.createElement("div");
        container.id = "riyaVoiceControls";

        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            margin: 12px 0;
        `;

        const label = document.createElement("label");
        label.textContent = "Riya's voice";
        label.htmlFor = "riyaVoiceSelect";

        const select = document.createElement("select");
        select.id = "riyaVoiceSelect";

        select.style.cssText = `
            padding: 8px 12px;
            border-radius: 8px;
            max-width: 240px;
        `;

        select.addEventListener("change", () => {
            selectedVoiceURI = select.value;
        });

        container.append(label, select);

        const heading = $("#interviewSub");

        if (heading) {
            heading.insertAdjacentElement("afterend", container);
        } else {
            interviewPanel.prepend(container);
        }
    }

    const select = $("#riyaVoiceSelect");
    if (!select) return;

    const voices = getAvailableVoices().filter(voice =>
        voice.lang.toLowerCase().startsWith("en")
    );

    const previousValue = selectedVoiceURI || select.value;

    select.replaceChildren();

    if (!voices.length) {
        const option = document.createElement("option");
        option.textContent = "Default English voice";
        option.value = "";
        select.appendChild(option);
        return;
    }

    voices.forEach(voice => {
        const option = document.createElement("option");

        option.value = voice.voiceURI;
        option.textContent = `${voice.name} (${voice.lang})`;

        select.appendChild(option);
    });

    const preferredVoice =
        voices.find(voice => voice.voiceURI === previousValue) ||
        voices.find(voice => /female|samantha|aria|jenny/i.test(voice.name)) ||
        voices[0];

    selectedVoiceURI = preferredVoice.voiceURI;
    select.value = selectedVoiceURI;
}

function speakRiya(text, listenAfterSpeaking = true) {
    if (!text || !text.trim()) {
        console.error("Riya received no text to speak.");
        return;
    }

    if (!("speechSynthesis" in window)) {
        notify("Speech playback is unavailable in this browser.");
        return;
    }

    stopRiyaSpeaking();

    currentQuestion = text;

    const utterance = new SpeechSynthesisUtterance(text);

    const voices = getAvailableVoices();

    const selectedVoice = voices.find(
        voice => voice.voiceURI === selectedVoiceURI
    );

    if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
    } else {
        utterance.lang = "en-US";
    }

    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    utterance.volume = 1;

    utterance.onstart = () => {
        setState("speaking", "Riya is speaking");

        const caption = $("#captionBox");
        if (caption) caption.textContent = text;

        console.log("Riya speaking:", text);
    };

    utterance.onend = () => {
        console.log("Riya finished speaking.");

        if (endingInterview || !interviewActive) return;

        setState("idle", "Riya is ready");

        if (listenAfterSpeaking) {
            // Allow the browser to finish the speech event first.
            setTimeout(() => {
                if (interviewActive && !endingInterview) {
                    startListening();
                }
            }, 500);
        }
    };

    utterance.onerror = event => {
        console.error("Speech synthesis error:", event.error);
        setState("idle", "Riya is ready");
    };

    window.speechSynthesis.speak(utterance);
}

// Load browser voices when they become available.
if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = setupVoiceSelector;
}

// ==================================================
// SPEECH RECOGNITION
// ==================================================

function stopListening() {
    if (recognition) {
        recognitionShouldSubmit = true;

        try {
            recognition.stop();
        } catch (error) {
            console.warn("Recognition stop:", error);
        }
    }
}

function startListening() {
    if (!interviewActive || endingInterview || requestInProgress) {
        return;
    }

    if (!SpeechRecognition) {
        notify("Please use Google Chrome for voice recognition.");
        return;
    }

    stopRiyaSpeaking();

    // Remove old recognition handlers before replacing the instance.
    if (recognition) {
        recognition.onend = null;
        recognition.onerror = null;

        try {
            recognition.abort();
        } catch {}

        recognition = null;
    }

    currentTranscript = "";
    recognitionShouldSubmit = true;

    const instance = new SpeechRecognition();

    recognition = instance;

    instance.lang = "en-US";
    instance.continuous = false;
    instance.interimResults = true;
    instance.maxAlternatives = 1;

    const micButton = $("#micButton");
    const micLabel = $("#micLabel");
    const captionBox = $("#captionBox");

    instance.onstart = () => {
        recording = true;

        micButton?.classList.add("recording");

        if (micLabel) {
            micLabel.textContent = "Stop speaking";
        }

        if (captionBox) {
            captionBox.textContent = "Listening to your answer...";
        }

        setState("listening", "Riya is listening");
    };

    instance.onresult = event => {
        let finalText = "";
        let interimText = "";

        for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0].transcript;

            if (result.isFinal) {
                finalText += text + " ";
            } else {
                interimText += text;
            }
        }

        currentTranscript = finalText.trim();

        const displayText =
            `${finalText} ${interimText}`.trim();

        if (captionBox) {
            captionBox.textContent = displayText || "Listening...";
        }
    };

    instance.onerror = event => {
        console.error("Speech recognition error:", event.error);

        if (event.error === "not-allowed") {
            notify("Please allow microphone access in Chrome.");
        } else if (event.error === "no-speech") {
            notify("I couldn't hear you. Please try again.");
        } else if (
            event.error !== "aborted" &&
            event.error !== "no-speech"
        ) {
            notify("There was a microphone error.");
        }
    };

    instance.onend = async () => {
        if (recognition !== instance) return;

        recording = false;
        recognition = null;

        micButton?.classList.remove("recording");

        if (micLabel) {
            micLabel.textContent = "Start speaking";
        }

        const answer = currentTranscript.trim();

        if (!answer) {
            if (interviewActive && !endingInterview) {
                setState("idle", "Riya is ready");

                if (captionBox) {
                    captionBox.textContent =
                        "I didn't catch that. Please try speaking again.";
                }
            }

            return;
        }

        console.log("Applicant answer:", answer);

        if (interviewActive && !endingInterview) {
            await sendAnswerToGemini(answer);
        }
    };

    try {
        instance.start();
    } catch (error) {
        console.error("Unable to start microphone:", error);
        notify("Unable to start the microphone. Try again.");
    }
}

// ==================================================
// DYNAMIC GEMINI INTERVIEW
// ==================================================

function updateInterviewDisplay(message, topic) {
    const questionNumber = $("#questionNumber");
    const questionType = $("#questionType");
    const questionText = $("#questionText");
    const progressText = $("#progressText");

    const assistantQuestionCount = interviewHistory.filter(
        turn => turn.role === "assistant"
    ).length;

    if (questionNumber) {
        questionNumber.textContent =
            String(assistantQuestionCount).padStart(2, "0");
    }

    if (questionType) {
        questionType.textContent =
            (topic || "RIYA IS ASKING").replaceAll("_", " ").toUpperCase();
    }

    if (questionText) {
        questionText.textContent = message;
    }

    if (progressText) {
        progressText.textContent =
            `Questions and responses: ${Math.floor(interviewHistory.length / 2)}`;
    }

    const nextButton = $("#nextQuestion");

    if (nextButton) {
        nextButton.classList.add("hidden");
        nextButton.disabled = true;
    }

    const captionBox = $("#captionBox");

    if (captionBox) {
        captionBox.textContent = message;
    }
}

async function startGeminiConversation() {
    requestInProgress = true;
    setState("thinking", "Riya is preparing your interview");

    try {
        const result = await backendRequest(
            "/api/interview/chat",
            {
                visa_type: visa,
                user_message: "",
                history: [],
                profile: extractedProfile,
                start_interview: true,
                end_interview: false
            }
        );

        if (!result.assistant_message) {
            throw new Error("Riya did not return an opening message.");
        }

        interviewHistory.push({
            role: "assistant",
            content: result.assistant_message
        });

        updateInterviewDisplay(
            result.assistant_message,
            result.topic
        );

        requestInProgress = false;

        speakRiya(result.assistant_message, true);

    } catch (error) {
        requestInProgress = false;

        console.error("Starting Gemini interview failed:", error);

        notify(error.message || "Could not start the AI interview.");

        setState("idle", "Riya is ready");
    }
}

async function sendAnswerToGemini(answer) {
    if (requestInProgress || endingInterview || !interviewActive) {
        return;
    }

    if (!answer || !answer.trim()) return;

    requestInProgress = true;

    setState("thinking", "Riya is thinking");

    const micLabel = $("#micLabel");
    if (micLabel) micLabel.textContent = "Riya is thinking...";

    const captionBox = $("#captionBox");
    if (captionBox) {
        captionBox.textContent = "Riya is considering your answer...";
    }

    // Send previous turns as history and the latest answer separately.
    // The backend appends user_message to the Gemini conversation.
    try {
        const result = await backendRequest(
            "/api/interview/chat",
            {
                visa_type: visa,
                user_message: answer,
                history: interviewHistory,
                profile: extractedProfile,
                start_interview: false,
                end_interview: false
            }
        );

        // Save the applicant's answer and Riya's new response.
        interviewHistory.push({
            role: "user",
            content: answer
        });

        interviewHistory.push({
            role: "assistant",
            content: result.assistant_message
        });

        if (result.interview_complete) {
            requestInProgress = false;
            await finishInterview(false);
            return;
        }

        updateInterviewDisplay(
            result.assistant_message,
            result.topic
        );

        requestInProgress = false;

        speakRiya(result.assistant_message, true);

    } catch (error) {
        requestInProgress = false;

        console.error("Gemini conversation error:", error);

        notify(error.message || "Riya couldn't process your answer.");

        if (captionBox) {
            captionBox.textContent =
                "Something went wrong. Please try answering again.";
        }

        setState("idle", "Riya is ready");
        if (micLabel) micLabel.textContent = "Start speaking";
    }
}

// ==================================================
// END INTERVIEW AND GENERATE FEEDBACK
// ==================================================

async function finishInterview(sendEndRequest = true) {
    if (endingInterview) return;

    endingInterview = true;
    interviewActive = false;

    stopRiyaSpeaking();

    if (recognition) {
        recognition.onend = null;
        recognition.onerror = null;

        try {
            recognition.abort();
        } catch {}

        recognition = null;
    }

    recording = false;
    requestInProgress = true;

    setState("thinking", "Riya is preparing your feedback");

    const endButton = $("#endButton");

    if (endButton) {
        endButton.disabled = true;
    }

    try {
        if (sendEndRequest) {
            const endResult = await backendRequest(
                "/api/interview/chat",
                {
                    visa_type: visa,
                    user_message: "",
                    history: interviewHistory,
                    profile: extractedProfile,
                    start_interview: false,
                    end_interview: true
                }
            );

            if (endResult.assistant_message) {
                // The end message is not an applicant answer and is
                // intentionally not included in feedback history.
                speakRiya(endResult.assistant_message, false);

                await new Promise(resolve => {
                    setTimeout(resolve, 2500);
                });

                stopRiyaSpeaking();
            }
        }

        if (!interviewHistory.length) {
            throw new Error("There is no interview conversation to evaluate.");
        }

        const result = await backendRequest(
            "/api/interview/feedback",
            {
                visa_type: visa,
                history: interviewHistory,
                profile: extractedProfile
            }
        );

        if (!result.feedback) {
            throw new Error("Riya did not return interview feedback.");
        }

        renderFeedback(result.feedback);

        requestInProgress = false;

        showComplete();

    } catch (error) {
        requestInProgress = false;

        console.error("Feedback generation error:", error);

        // Still show the completion page, but explain that feedback failed.
        renderFeedback({
            overall_summary:
                "Your interview has ended, but Riya couldn't generate feedback.",
            strengths: [],
            improvement_areas: [error.message],
            practice_tips: [
                "Check that the backend is running.",
                "Check your Gemini API configuration.",
                "Try the interview again."
            ],
            consistency_notes: [],
            disclaimer:
                "This is a practice tool, not an official visa decision."
        });

        showComplete();

    } finally {
        if (endButton) endButton.disabled = false;
    }
}

// ==================================================
// DISPLAY GEMINI FEEDBACK
// ==================================================

function renderFeedback(feedback) {
    if (!complete) return;

    let container = $("#riyaFeedback");

    if (!container) {
        container = document.createElement("div");
        container.id = "riyaFeedback";

        container.style.cssText = `
            margin-top: 24px;
            text-align: left;
            line-height: 1.6;
        `;

        complete.appendChild(container);
    }

    container.replaceChildren();

    function addSection(title, content) {
        const section = document.createElement("section");
        section.style.marginBottom = "20px";

        const heading = document.createElement("h3");
        heading.textContent = title;

        section.appendChild(heading);

        if (Array.isArray(content)) {
            const list = document.createElement("ul");

            content.forEach(item => {
                const li = document.createElement("li");
                li.textContent = item;
                list.appendChild(li);
            });

            section.appendChild(list);
        } else {
            const paragraph = document.createElement("p");
            paragraph.textContent = content || "No details provided.";
            section.appendChild(paragraph);
        }

        container.appendChild(section);
    }

    addSection("Overall summary", feedback.overall_summary);
    addSection("Your strengths", feedback.strengths);
    addSection("Areas to improve", feedback.improvement_areas);
    addSection("Practice tips", feedback.practice_tips);
    addSection("Consistency notes", feedback.consistency_notes);
    addSection("Important note", feedback.disclaimer);
}

// ==================================================
// OPEN AND CLOSE APPLICATION
// ==================================================

function openApp() {
    if (!app) return;

    app.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    showSetup();
    window.scrollTo(0, 0);
}

function closeApp() {
    stopRiyaSpeaking();

    if (recognition) {
        recognition.onend = null;
        recognition.onerror = null;

        try {
            recognition.abort();
        } catch {}

        recognition = null;
    }

    interviewActive = false;
    endingInterview = false;
    requestInProgress = false;
    recording = false;

    if (app) {
        app.classList.add("hidden");
    }

    document.body.style.overflow = "";

    const pdfInput = $("#pdfInput");
    if (pdfInput) pdfInput.value = "";

    file = null;
    extractedProfile = {};
    interviewHistory = [];
    currentTranscript = "";

    profileFields?.replaceChildren();

    const uploadTitle = $("#uploadTitle");
    const uploadSub = $("#uploadSub");

    if (uploadTitle) uploadTitle.textContent = "Choose a PDF file";
    if (uploadSub) uploadSub.textContent = "PDF only · Up to 10 MB";

    $("#uploadArea")?.classList.add("hidden");

    prep = "questions";

    $$(".prep-option").forEach(button => {
        button.classList.toggle(
            "selected",
            button.dataset.prep === "questions"
        );
    });
}

// ==================================================
// SCREEN NAVIGATION
// ==================================================

function showSetup() {
    stopRiyaSpeaking();

    setup?.classList.remove("hidden");
    profileReview?.classList.add("hidden");
    interview?.classList.add("hidden");
    complete?.classList.add("hidden");

    updateStep("01", "04");
}

function showInterview() {
    setup?.classList.add("hidden");
    profileReview?.classList.add("hidden");
    interview?.classList.remove("hidden");
    complete?.classList.add("hidden");

    updateStep(
        prep === "document" ? "03" : "02",
        prep === "document" ? "04" : "03"
    );

    interviewHistory = [];
    currentTranscript = "";
    currentQuestion = "";

    interviewActive = true;
    endingInterview = false;
    requestInProgress = false;

    const activeVisa = $("#activeVisa");

    if (activeVisa) {
        activeVisa.textContent =
            visa === "B1/B2" ? "B1/B2 Visitor" :
            visa === "F1" ? "F1 Student" :
            visa === "F2" ? "F2 Dependent" :
            "H1B Work";
    }

    const interviewSub = $("#interviewSub");

    if (interviewSub) {
        interviewSub.textContent =
            "Speak naturally. Riya will ask follow-up questions based on your answers.";
    }

    setupVoiceSelector();

    const nextButton = $("#nextQuestion");
    if (nextButton) nextButton.classList.add("hidden");

    const questionText = $("#questionText");
    if (questionText) {
        questionText.textContent = "Riya is getting ready...";
    }

    const questionType = $("#questionType");
    if (questionType) questionType.textContent = "STARTING INTERVIEW";

    const progressText = $("#progressText");
    if (progressText) progressText.textContent = "Your interview has started";

    startGeminiConversation();
}

function showComplete() {
    stopRiyaSpeaking();

    interviewActive = false;
    endingInterview = true;

    if (recording) stopListening();

    interview?.classList.add("hidden");
    profileReview?.classList.add("hidden");
    complete?.classList.remove("hidden");

    updateStep(
        prep === "document" ? "04" : "03",
        prep === "document" ? "04" : "03"
    );

    console.log("FINAL INTERVIEW HISTORY:", interviewHistory);
}

// ==================================================
// VISA CATEGORY SELECTION
// ==================================================

$$(".visa-option").forEach(button => {
    button.addEventListener("click", () => {
        $$(".visa-option").forEach(option => {
            option.classList.remove("selected");
        });

        button.classList.add("selected");
        visa = button.dataset.visa;

        console.log("Selected visa:", visa);
    });
});

// ==================================================
// LANGUAGE SELECTION
// ==================================================

$$(".language-option:not(.disabled-option)").forEach(button => {
    button.addEventListener("click", () => {
        $$(".language-option").forEach(option => {
            option.classList.remove("selected");
        });

        button.classList.add("selected");
        language = button.dataset.language;
    });
});

// ==================================================
// PREPARATION METHOD SELECTION
// ==================================================

$$(".prep-option").forEach(button => {
    button.addEventListener("click", () => {
        $$(".prep-option").forEach(option => {
            option.classList.remove("selected");
        });

        button.classList.add("selected");
        prep = button.dataset.prep;

        $("#uploadArea")?.classList.toggle(
            "hidden",
            prep !== "document"
        );

        if (prep === "questions") {
            file = null;

            if (pdfInput) pdfInput.value = "";

            const uploadTitle = $("#uploadTitle");
            const uploadSub = $("#uploadSub");

            if (uploadTitle) uploadTitle.textContent = "Choose a PDF file";
            if (uploadSub) uploadSub.textContent = "PDF only · Up to 10 MB";
        }
    });
});

// ==================================================
// PDF FILE SELECTION
// ==================================================

const pdfInput = $("#pdfInput");

pdfInput?.addEventListener("change", event => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) return;

    const isPdf =
        selectedFile.type === "application/pdf" ||
        selectedFile.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
        notify("Please choose a PDF file.");
        event.target.value = "";
        file = null;
        return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
        notify("Please choose a PDF smaller than 10 MB.");
        event.target.value = "";
        file = null;
        return;
    }

    file = selectedFile;

    const uploadTitle = $("#uploadTitle");
    const uploadSub = $("#uploadSub");

    if (uploadTitle) uploadTitle.textContent = selectedFile.name;

    if (uploadSub) {
        uploadSub.textContent =
            (selectedFile.size / 1024 / 1024).toFixed(2) +
            " MB · Selected locally";
    }

    notify("PDF selected.");
});

// ==================================================
// PROFILE DATA NORMALIZATION
// ==================================================

function normalizeProfileResponse(responseData) {
    let data = responseData;

    for (let i = 0; i < 3; i++) {
        if (
            data &&
            typeof data === "object" &&
            !Array.isArray(data) &&
            data.profile &&
            typeof data.profile === "object"
        ) {
            data = data.profile;
            continue;
        }

        if (
            data &&
            typeof data === "object" &&
            !Array.isArray(data) &&
            data.data &&
            typeof data.data === "object"
        ) {
            data = data.data;
            continue;
        }

        break;
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return {};
    }

    const normalized = {};

    Object.entries(data).forEach(([key, value]) => {
        const cleanKey = key
            .toLowerCase()
            .trim()
            .replace(/[\s-]+/g, "_");

        const finalKey = profileAliases[cleanKey];

        if (!finalKey || !Object.hasOwn(profileLabels, finalKey)) {
            return;
        }

        let cleanValue = "";

        if (typeof value === "string" || typeof value === "number") {
            cleanValue = String(value).trim();
        } else if (
            Array.isArray(value) &&
            value.every(item => typeof item === "string")
        ) {
            cleanValue = value.join(", ").trim();
        }

        if (cleanValue) normalized[finalKey] = cleanValue;
    });

    return normalized;
}

// ==================================================
// PROFILE REVIEW SCREEN
// ==================================================

function showProfileReview(profileData) {
    if (!profileReview || !profileFields || !profileEmptyMessage) {
        notify("Profile review HTML elements are missing.");
        return;
    }

    extractedProfile = normalizeProfileResponse(profileData);

    setup?.classList.add("hidden");
    interview?.classList.add("hidden");
    complete?.classList.add("hidden");

    profileReview.classList.remove("hidden");

    updateStep("02", "04");

    profileFields.replaceChildren();

    const entries = Object.entries(extractedProfile);

    profileEmptyMessage.classList.toggle(
        "hidden",
        entries.length > 0
    );

    entries.forEach(([key, value]) => {
        const wrapper = document.createElement("div");
        wrapper.className = "profile-field";

        const label = document.createElement("label");
        label.textContent = profileLabels[key];
        label.htmlFor = `profile-${key}`;

        const input = document.createElement("input");
        input.id = `profile-${key}`;
        input.name = key;
        input.type = "text";
        input.maxLength = 250;
        input.value = value;

        wrapper.append(label, input);
        profileFields.appendChild(wrapper);
    });
}

function collectReviewedProfile() {
    const reviewed = {};

    profileFields?.querySelectorAll("input").forEach(input => {
        const key = input.name;
        const value = input.value.trim();

        if (
            Object.hasOwn(profileLabels, key) &&
            value.length > 0
        ) {
            reviewed[key] = value;
        }
    });

    return reviewed;
}

// ==================================================
// BACKEND INTERVIEW SETUP
// ==================================================

async function startInterview(profile = {}) {
    const setupData = {
        visa_type: visa,
        language: language,
        prep_mode: prep,
        document_selected: prep === "document" && Boolean(file)
    };

    const result = await backendRequest(
        "/api/interview/setup",
        setupData
    );

    if (result.status !== "success") {
        throw new Error(result.message || "Interview setup failed.");
    }

    extractedProfile = { ...profile };

    showInterview();

    notify("Riya is starting your interview.");
}

// ==================================================
// MAIN CONTINUE BUTTON
// ==================================================

addClick("#continueButton", async () => {
    const button = $("#continueButton");
    if (!button) return;

    if (prep === "document" && !file) {
        notify("Please choose a PDF file first.");
        return;
    }

    button.disabled = true;

    try {
        if (prep === "document") {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch(
                `${BACKEND_URL}/api/documents/profile-preview?visa_type=${encodeURIComponent(visa)}`,
                {
                    method: "POST",
                    body: formData
                }
            );

            const result = await response.json();

            if (!response.ok || result.status !== "success") {
                throw new Error(
                    result.detail ||
                    result.message ||
                    "Profile extraction failed."
                );
            }

            showProfileReview(result);
            notify("Please review your extracted details.");

        } else {
            await startInterview({});
        }

    } catch (error) {
        console.error("Setup error:", error);
        notify(error.message || "Unable to connect to Riya AI.");

    } finally {
        button.disabled = false;
    }
});

// ==================================================
// PROFILE CONFIRMATION
// ==================================================

addClick("#confirmProfile", async () => {
    const button = $("#confirmProfile");
    if (!button) return;

    button.disabled = true;

    try {
        await startInterview(collectReviewedProfile());

    } catch (error) {
        console.error("Profile confirmation error:", error);
        notify(error.message || "Unable to continue.");

    } finally {
        button.disabled = false;
    }
});

addClick("#backToSetup", () => {
    profileReview?.classList.add("hidden");
    setup?.classList.remove("hidden");

    updateStep("01", "04");
});

// ==================================================
// MICROPHONE BUTTON
// ==================================================

addClick("#micButton", () => {
    if (!interviewActive || endingInterview) return;

    if (recording) {
        stopListening();
    } else if (!requestInProgress) {
        startListening();
    }
});

// ==================================================
// REPEAT RIYA'S LAST QUESTION
// ==================================================

addClick("#repeatButton", () => {
    if (recording) {
        if (recognition) {
            recognition.onend = null;

            try {
                recognition.abort();
            } catch {}

            recognition = null;
        }

        recording = false;
    }

    if (currentQuestion && interviewActive) {
        speakRiya(currentQuestion, true);
    }
});

// ==================================================
// END INTERVIEW BUTTON
// ==================================================

addClick("#endButton", () => {
    if (!interviewActive || endingInterview) return;

    if (recording && recognition) {
        recognition.onend = null;
        recognition.onerror = null;

        try {
            recognition.abort();
        } catch {}

        recognition = null;
    }

    finishInterview(true);
});

// ==================================================
// PRACTICE AGAIN
// ==================================================

addClick("#practiceAgain", () => {
    interviewHistory = [];
    extractedProfile = {};
    currentQuestion = "";

    interviewActive = false;
    endingInterview = false;
    requestInProgress = false;

    $("#riyaFeedback")?.remove();

    showSetup();
});

// ==================================================
// RETURN HOME
// ==================================================

addClick("#returnHome", closeApp);
addClick("#backHome", closeApp);

$$("[data-home]").forEach(button => {
    button.addEventListener("click", event => {
        event.preventDefault();
        closeApp();
    });
});

// ==================================================
// START BUTTONS
// ==================================================

$$("[data-start]").forEach(button => {
    button.addEventListener("click", openApp);
});

// ==================================================
// MENU BUTTON
// ==================================================

addClick("#menuButton", () => {
    notify("Use the page sections below to explore Riya.");
});

// ==================================================
// INITIAL ROBOT ANIMATION
// ==================================================

setTimeout(() => {
    const heroMascot = $("#heroMascot");

    if (!heroMascot) return;

    heroMascot.dataset.state = "wave";

    setTimeout(() => {
        heroMascot.dataset.state = "idle";
    }, 1800);
}, 700);

// ==================================================
// INITIALIZATION
// ==================================================

setupVoiceSelector();

console.log("Riya AI dynamic frontend initialized.");

console.log("Browser speech recognition:", !!SpeechRecognition);
console.log("Browser speech synthesis:", !!window.speechSynthesis);
console.log("Backend:", BACKEND_URL);
