const apiKey = "AIzaSyA5y-1WlLrbIVnsda2gkltOkpR8mNO9Gvo"; // Replace with your Google Gemini API key
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
const FlashcardDisplay = document.getElementById("output");

let paragraphs = [];
// Extract text from PDF
async function extractText() {
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select a PDF file");
    return;
  }

  const reader = new FileReader();

  reader.onload = async function (e) {
    const pdfData = new Uint8Array(e.target.result);
    const pdfDoc = await pdfjsLib.getDocument(pdfData).promise;

    // Get starting and ending page from the user (for example, from page 10 to 20)
    const startPage = 48; // Specify your starting page (e.g., 10)
    const endPage = 57; // Specify your ending page (e.g., 20)

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

async function generateFlashcardsForParagraphs(paragraphs) {
  const allFlashcards = []; //array of flashcards, this part must be a object array

  const H1 = document.createElement("h1");

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];

    // Construct the prompt for the API
    const prompt = `Make an neccessary amount of anki like question or flashcard for this paragraph '${paragraph}.' Your response must be 1. In json form [{Q: The Question, A: The answer, Extra : The portion of the paragraph where you make the question }, {Q: the 2nd Question, A: the 2nd quesitons answer, Extra : The portion of the paragraph where you make the 2nd question}] and so on. let your extra use the same as the paragraph provide, but you must trim were you should only the sentence that you make the question from. Make your question detailed because i am using this to prepare for my exams, I DONT WANT TO MISS ANY KNOWLEDGE OF THE PARAGRAPH`;

    H1.textContent = `Making Flashcard ${i + 1}`;
    FlashcardDisplay.appendChild(H1);

    // Call the Gemini API
    const flashcards = await callGeminiAPI(prompt);
    const cleanedResponse = flashcards.replace(/```json\n|\```/g, "");
    const parsedFlashcards = JSON.parse(cleanedResponse); // Convert JSON string to object
    allFlashcards.push(...parsedFlashcards);
  }
  FlashcardDisplay.innerHTML = "flashcards";

  allFlashcards.forEach((flashcard) => {
    allFlashcards.forEach((flashcard) => {
      const div = document.createElement("div");

      // Create elements separately for better control
      const question = `<h2>Q: ${flashcard.Q}</h2>`;
      const answer = `<p class="answer" style="display: none">Answer: ${flashcard.A}</p>`;
      const extra = `<p class="extra" style="display: none">Extra: ${flashcard.Extra}</p>`;

      div.innerHTML =
        question + answer + extra + "<button>Show Answer</button>";

      // Get the button and content elements
      const button = div.querySelector("button");
      const answerElement = div.querySelector(".answer");
      const extraElement = div.querySelector(".extra");

      // Track the current state
      let state = "question"; // can be 'question', 'answer', or 'extra'

      // Add click event listener
      button.addEventListener("click", () => {
        switch (state) {
          case "question":
            answerElement.style.display = "block";
            button.textContent = "Show Extra";
            state = "answer";
            break;

          case "answer":
            extraElement.style.display = "block";
            button.textContent = "Hide All";
            state = "extra";
            break;

          case "extra":
            answerElement.style.display = "none";
            extraElement.style.display = "none";
            button.textContent = "Show Answer";
            state = "question";
            break;
        }
      });

      FlashcardDisplay.appendChild(div);

      div.style.backgroundColor = "lightblue";
      div.style.padding = "10px";
      div.style.margin = "10px";
      div.style.borderRadius = "5px";
      div.style.border = "1px solid black";
    });
  });
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
