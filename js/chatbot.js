document.addEventListener("DOMContentLoaded", () => {
    // 1. Inject CSS Dynamically
    if (!document.querySelector('link[href*="chatbot.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        // Handle relative paths based on if we are in root or /frontend/
        const isFrontendDir = window.location.pathname.includes('/frontend/');
        link.href = isFrontendDir ? '../css/chatbot.css' : 'css/chatbot.css';
        document.head.appendChild(link);
    }

    // 2. Chatbot HTML Structure
    const chatbotHTML = `
        <button class="chatbot-toggler">
            <span class="fas fa-comment"></span>
            <span class="fas fa-xmark"></span>
        </button>
        <div class="chatbot">
            <header>
                <h2><i class="fas fa-leaf"></i> Eco Support</h2>
                <p>Smart Waste AI Assistant</p>
            </header>
            <ul class="chatbox" id="chatbox">
                <li class="chat incoming">
                    <div class="chat-icon"><i class="fas fa-robot"></i></div>
                    <p>Hello! How can I help you today?</p>
                </li>
                <div class="chat-quick-replies" id="quickReplies">
                    <button class="quick-btn" onclick="sendQuickReply('What is this website?')">What is this website?</button>
                    <button class="quick-btn" onclick="sendQuickReply('How do I report waste?')">How do I report waste?</button>
                    <button class="quick-btn" onclick="sendQuickReply('How does eco points work?')">How does eco points work?</button>
                    <button class="quick-btn" onclick="sendQuickReply('How can I track my report?')">How can I track my report?</button>
                    <button class="quick-btn" onclick="sendQuickReply('Who can use this system?')">Who can use this system?</button>
                </div>
            </ul>
            <div class="chat-input-wrapper">
                <input type="text" id="chatInput" placeholder="Ask a question..." required>
                <button id="sendChatBtn"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", chatbotHTML);

    // 3. Logic Setup
    const chatbotToggler = document.querySelector(".chatbot-toggler");
    const chatInput = document.getElementById("chatInput");
    const sendChatBtn = document.getElementById("sendChatBtn");
    const chatbox = document.getElementById("chatbox");
    const quickReplies = document.getElementById("quickReplies");

    chatbotToggler.addEventListener("click", () => document.body.classList.toggle("show-chatbot"));

    window.sendQuickReply = (text) => {
        handleChat(text);
        if (quickReplies) quickReplies.style.display = 'none';
        chatInput.focus();
    };

    const createChatLi = (message, className) => {
        const chatLi = document.createElement("li");
        chatLi.classList.add("chat", className);
        let chatContent = className === "outgoing" 
            ? `<p></p>` 
            : `<div class="chat-icon"><i class="fas fa-robot"></i></div><p></p>`;
        chatLi.innerHTML = chatContent;
        chatLi.querySelector("p").textContent = message; // Prevents XSS visually
        return chatLi;
    }

    const generateResponse = (userMessage) => {
        const lowerMsg = userMessage.toLowerCase();
        let response = "I'm not sure about that. Please contact our human support team via the Contact page.";

        if(lowerMsg.includes("what is this") || lowerMsg.includes("website") || lowerMsg.includes("platform")) {
            response = "This is a Smart Waste Management System that allows citizens to report waste and helps authorities manage collection efficiently.";
        } else if(lowerMsg.includes("report waste") || lowerMsg.includes("how to report") || lowerMsg.includes("report")) {
            response = "Go to the Report page from the navigation bar, upload an image of the waste, and submit your GPS location.";
        } else if(lowerMsg.includes("eco point") || lowerMsg.includes("points")) {
            response = "You earn Eco Points by submitting valid waste reports. These points act as a gamified reward for promoting urban sustainability!";
        } else if(lowerMsg.includes("track") || lowerMsg.includes("status")) {
            response = "You can view the status of your reports (Pending, Dispatched, Collected) on the interactive map located in your Dashboard.";
        } else if(lowerMsg.includes("who can use") || lowerMsg.includes("access")) {
            response = "Any citizen can create an account to file reports. Administrators and registered fleet drivers have special access to manage fleet operations.";
        } else if(lowerMsg.includes("hello") || lowerMsg.includes("hi") || lowerMsg.includes("hey")) {
            response = "Hello there! Do you have any questions about the Smart Waste platform?";
        }

        const incomingChatLi = createChatLi(response, "incoming");
        chatbox.appendChild(incomingChatLi);
        chatbox.scrollTo(0, chatbox.scrollHeight);
    }

    const handleChat = (manualText = null) => {
        const userMessage = manualText || chatInput.value.trim();
        if (!userMessage) return;

        chatInput.value = "";
        if (quickReplies && !manualText) quickReplies.style.display = 'none';

        // Add user message
        chatbox.appendChild(createChatLi(userMessage, "outgoing"));
        chatbox.scrollTo(0, chatbox.scrollHeight);

        // Simulate thinking
        setTimeout(() => {
            const typingLi = createChatLi("Typing...", "incoming");
            typingLi.id = "typingIndicator";
            chatbox.appendChild(typingLi);
            chatbox.scrollTo(0, chatbox.scrollHeight);
            
            setTimeout(() => {
                document.getElementById("typingIndicator")?.remove();
                generateResponse(userMessage);
            }, 600);
        }, 400);
    }

    sendChatBtn.addEventListener("click", () => handleChat());
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleChat();
        }
    });
});
