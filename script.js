const apiKey = "AIzaSyA5y-1WlLrbIVnsda2gkltOkpR8mNO9Gvo"; // Replace with your Google Gemini API key
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
const FlashcardDisplay = document.getElementById("output");

const toggleSwitch = document.querySelector("#checkbox");
const currentTheme = localStorage.getItem("theme");

if (currentTheme) {
  document.documentElement.setAttribute("data-theme", currentTheme);
  if (currentTheme === "dark") {
    toggleSwitch.checked = true;
  }
}

function switchTheme(e) {
  if (e.target.checked) {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  }
}

toggleSwitch.addEventListener("change", switchTheme);

let paragraphs = [];
let generatedFlashcards = [];
const INITIAL_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;

// Add this class for managing card states
class FlashcardState {
  constructor(flashcard) {
    this.flashcard = flashcard;
    this.interval = 0; // Days until next review
    this.ease = INITIAL_EASE;
    this.reviews = 0;
    this.lastReview = new Date();
    this.dueDate = new Date();
  }

  review(difficulty) {
    this.reviews++;
    const now = new Date();

    switch (difficulty) {
      case "idk":
        this.interval = 0;
        this.ease = Math.max(MIN_EASE, this.ease - 0.2);
        this.dueDate = new Date(now.getTime() + 1 * 60 * 1000);
        break;

      case "hard":
        this.interval = Math.max(1, this.interval * 1.2);
        this.ease = Math.max(MIN_EASE, this.ease - 0.15);
        break;

      case "good":
        if (this.interval === 0) {
          this.interval = 1;
        } else {
          this.interval = this.interval * this.ease;
        }
        break;

      case "easy":
        if (this.interval === 0) {
          this.interval = 4;
        } else {
          this.interval = this.interval * this.ease * 1.3;
        }
        this.ease = Math.min(MAX_EASE, this.ease + 0.15);
        break;
    }

    this.lastReview = now;

    if (difficulty !== "idk") {
      this.interval = Math.round(this.interval);
      this.dueDate = new Date(
        now.getTime() + this.interval * 24 * 60 * 60 * 1000
      );
    }

    return {
      nextReview: this.dueDate,
      interval: this.interval,
      ease: this.ease,
    };
  }
}

// Extract text from PDF
async function extractText() {
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select a PDF file");
    return;
  }

  const startPageInput = document.getElementById("startPage");
  const endPageInput = document.getElementById("endPage");
  const startPage = parseInt(startPageInput.value);
  const endPage = parseInt(endPageInput.value);

  // Validate page numbers
  if (
    isNaN(startPage) ||
    isNaN(endPage) ||
    startPage < 1 ||
    endPage < startPage
  ) {
    alert(
      "Please enter valid page numbers. Start page should be positive and not greater than end page."
    );
    return;
  }

  const reader = new FileReader();

  reader.onload = async function (e) {
    const pdfData = new Uint8Array(e.target.result);
    const pdfDoc = await pdfjsLib.getDocument(pdfData).promise;

    // Validate against PDF length
    if (endPage > pdfDoc.numPages) {
      alert(
        `The PDF only has ${pdfDoc.numPages} pages. Please adjust the page range.`
      );
      return;
    }

    // Reset paragraphs array
    paragraphs = [];

    // Loop through the pages in the specified range
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const textItems = textContent.items;
      let pageText = "";

      // Concatenate text from each item on the page
      textItems.forEach((item) => {
        pageText += item.str + " ";
      });

      // Split the text into paragraphs based on line breaks (or you can use custom split logic)
      const pageParagraphs = pageText
        .split("\n")
        .filter((paragraph) => paragraph.trim() !== "");

      // Add the extracted paragraphs to the array
      paragraphs = paragraphs.concat(pageParagraphs);
    }

    // After extracting paragraphs, call Gemini API for each paragraph
    await generateFlashcardsForParagraphs(paragraphs);
  };
  reader.readAsArrayBuffer(file);
}

// Modify your flashcard creation code
function createFlashcard(flashcard) {
  const div = document.createElement("div");
  const cardState = new FlashcardState(flashcard);

  // Create elements separately for better control
  const question = `<h2>Q: ${flashcard.Q}</h2>`;
  const answer = `<p class="answer" style="display: none">Answer: ${flashcard.A}</p>`;
  const extra = `<p class="extra" style="display: none">Extra: ${flashcard.Extra}</p>`;
  const reviewInfo = `<p class="review-info" style="display: none"></p>`;

  // Create difficulty buttons (initially hidden)
  const difficultyButtons = `
        <div class="difficulty-buttons" style="display: none">
            <button class="difficulty-btn idk">Again</button>
            <button class="difficulty-btn hard">Hard</button>
            <button class="difficulty-btn good">Good</button>
            <button class="difficulty-btn easy">Easy</button>
        </div>
    `;

  div.innerHTML =
    question +
    answer +
    extra +
    reviewInfo +
    "<button class='show-btn'>Show Answer</button>" +
    difficultyButtons;

  // Get the button and content elements
  const showButton = div.querySelector(".show-btn");
  const answerElement = div.querySelector(".answer");
  const extraElement = div.querySelector(".extra");
  const difficultyContainer = div.querySelector(".difficulty-buttons");
  const reviewInfoElement = div.querySelector(".review-info");

  // Track the current state
  let state = "question";

  // Add click event listener for show/hide
  showButton.addEventListener("click", () => {
    switch (state) {
      case "question":
        answerElement.style.display = "block";
        showButton.textContent = "Show Extra";
        difficultyContainer.style.display = "flex";
        state = "answer";
        break;

      case "answer":
        extraElement.style.display = "block";
        showButton.textContent = "Hide All";
        state = "extra";
        break;

      case "extra":
        answerElement.style.display = "none";
        extraElement.style.display = "none";
        difficultyContainer.style.display = "none";
        reviewInfoElement.style.display = "none";
        showButton.textContent = "Show Answer";
        state = "question";
        break;
    }
  });

  // Add click handlers for difficulty buttons
  div.querySelectorAll(".difficulty-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const difficulty = e.target.className.split(" ")[1];
      const result = cardState.review(difficulty);

      // Update review info with new function
      updateReviewInfo(reviewInfoElement, result.nextReview);

      // Save state to localStorage
      saveCardState(flashcard.Q, cardState);

      // Visual feedback
      div
        .querySelectorAll(".difficulty-btn")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  return div;
}

// Helper functions for state management
function saveCardState(cardId, state) {
  const states = JSON.parse(localStorage.getItem("flashcardStates") || "{}");
  states[cardId] = {
    interval: state.interval,
    ease: state.ease,
    reviews: state.reviews,
    lastReview: state.lastReview.toISOString(),
    dueDate: state.dueDate.toISOString(),
  };
  localStorage.setItem("flashcardStates", JSON.stringify(states));
}

// Modify your flashcard display code
async function generateFlashcardsForParagraphs(paragraphs) {
  const allFlashcards = [];

  const H1 = document.createElement("h1");
  H1.textContent = `Making Flashcard...`;
  FlashcardDisplay.appendChild(H1);

  try {
    // Map paragraphs to API call promises
    const flashcardPromises = paragraphs.map((paragraph, index) => {
      const prompt = `Make an neccessary amount of anki like question or flashcard for this paragraph '${paragraph}.' Your response must be 1. In json form [{Q: The Question, A: The answer, Extra : The portion of the paragraph where you make the question }, {Q: the 2nd Question, A: the 2nd quesitons answer, Extra : The portion of the paragraph where you make the 2nd question}] and so on. let your extra use the same as the paragraph provide, but you must trim were you should only the sentence that you make the question from. Make your question detailed because i am using this to prepare for my exams, I DONT WANT TO MISS ANY KNOWLEDGE OF THE PARAGRAPH. And dont say anything else, just the json`;

      console.log(`Requesting flashcards for paragraph ${index + 1}`);
      return callGeminiAPI(prompt);
    });

    // Execute all API calls concurrently
    const responses = await Promise.all(flashcardPromises);

    // Process each response
    responses.forEach((flashcards, index) => {
      const cleanedResponse = flashcards.replace(/```json\n|\```/g, "");
      try {
        const parsedFlashcards = JSON.parse(cleanedResponse);
        allFlashcards.push(...parsedFlashcards);
      } catch (error) {
        console.error(`Error parsing JSON for paragraph ${index + 1}:`, error);
      }
    });

    // Store flashcards globally
    generatedFlashcards = allFlashcards;

    // Show download button
    document.getElementById("downloadButton").style.display = "inline-block";

    // Display flashcards
    FlashcardDisplay.innerHTML = "";

    allFlashcards.forEach((flashcard) => {
      const flashcardElement = createFlashcard(flashcard);
      FlashcardDisplay.appendChild(flashcardElement);
    });
  } catch (error) {
    console.error("Error generating flashcards:", error);
    FlashcardDisplay.innerHTML =
      '<p style="color: red;">Error generating flashcards</p>';
  }
}

// Call Gemini API to generate flashcards
async function callGeminiAPI(prompt) {
  try {
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    };

    // Send POST request
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    // Check for errors
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    // Parse and log the response
    const data = await response.json();
    // Extract and return the flashcards from the response
    const flashcards =
      data.candidates[0]?.content?.parts[0]?.text ?? "No flashcards generated.";
    return flashcards;
  } catch (error) {
    console.error("Error:", error.message);
    return []; // Return an empty array in case of error
  }
}

// New download function
function downloadFlashcards() {
  if (generatedFlashcards.length > 0) {
    generateCSVForAnkiWithHR(generatedFlashcards);
  } else {
    alert(
      "No flashcards available to download. Please generate flashcards first."
    );
  }
}

// Function to convert flashcards to CSV format and trigger download with <hr> separating Answer and Extra
function generateCSVForAnkiWithHR(flashcards) {
  if (!flashcards || flashcards.length === 0) {
    console.error("No flashcards to export");
    alert("No flashcards to export");
    return;
  }

  try {
    // Helper function to properly escape CSV fields
    const escapeCSV = (text) => {
      if (!text) return '""';
      // Replace quotes with double quotes and wrap in quotes
      return `"${text.replace(/"/g, '""').replace(/\n/g, "<br>")}"`;
    };

    const csvRows = [];

    // Add CSV header with tags field
    const header = ["#separator:,", "#html:true", "Question,Answer,Tags"];
    csvRows.push(...header);

    // Add flashcard data to CSV
    flashcards.forEach((flashcard) => {
      // Combine Answer and Extra with styling
      const answerWithExtra = flashcard.Extra
        ? `${flashcard.A}<hr><div class="extra"><hr><br>${flashcard.Extra}</div>`
        : flashcard.A;

      const row = [
        escapeCSV(flashcard.Q),
        escapeCSV(answerWithExtra),
        '"Gemini-Generated"', // Add tags to help identify source
      ];
      csvRows.push(row.join(","));
    });

    // Join rows and create CSV content with UTF-8 BOM for Excel compatibility
    const csvContent = "\ufeff" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `flashcards_${timestamp}.csv`;

    // Create and trigger download
    const link = document.createElement("a");
    if (window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveOrOpenBlob(blob, filename);
    } else {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    // Show success message
    alert(
      `Successfully exported ${flashcards.length} flashcards to ${filename}`
    );
  } catch (error) {
    console.error("Error generating CSV:", error);
    alert("Error generating CSV file. Please try again.");
  }
}

// Handle difficulty selection
function handleDifficulty(difficulty, flashcard) {
  // You can implement spaced repetition logic here
  console.log(`Card marked as ${difficulty}`, flashcard);
  // Could save to localStorage or send to backend
}

// Update the review info display
function updateReviewInfo(reviewInfoElement, nextReview) {
  const now = new Date();
  const diffMinutes = Math.round((nextReview - now) / (1000 * 60));
  const diffDays = Math.ceil((nextReview - now) / (1000 * 60 * 60 * 24));

  let reviewText;
  if (diffMinutes < 60) {
    reviewText = `Next review in: ${diffMinutes} minute${
      diffMinutes !== 1 ? "s" : ""
    }`;
  } else if (diffDays < 1) {
    const hours = Math.ceil(diffMinutes / 60);
    reviewText = `Next review in: ${hours} hour${hours !== 1 ? "s" : ""}`;
  } else {
    reviewText = `Next review in: ${diffDays} day${diffDays !== 1 ? "s" : ""}`;
  }

  reviewInfoElement.textContent = reviewText;
  reviewInfoElement.style.display = "block";
}
