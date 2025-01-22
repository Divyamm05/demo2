

function renderChatHistory(history) {
    const chatLog = document.getElementById('chat-log');
    chatLog.innerHTML = ''; // Clear the chat log
    history.forEach(msg => {
      const messageDiv = document.createElement('div');
      messageDiv.classList.add('message', msg.role === 'user' ? 'user-message' : 'bot-message');
      messageDiv.innerHTML = msg.content;
      chatLog.appendChild(messageDiv);
    });
    chatLog.scrollTop = chatLog.scrollHeight; // Scroll to the bottom
  }
  
  function updateChatLog(message, role = "bot") {
    const chatLog = document.getElementById('chat-log');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'bot-message');
    messageDiv.innerHTML = message;
    chatLog.appendChild(messageDiv);
    chatLog.scrollTop = chatLog.scrollHeight; // Scroll to the bottom
  }
  
  function toggleChatbox() {
    const chatbox = document.getElementById('chatbox');
    const header = document.querySelector('.header');
    const inputs = document.querySelectorAll('.chat-input input, .chat-input button');
    const assistantLogo = document.getElementById('assistant-logo');
    const chatLog = document.getElementById('chat-log');
  
    if (chatbox.classList.contains('minimized')) {
      chatbox.classList.remove('minimized');
      chatbox.classList.add('visible');
      chatbox.style.display = 'flex';
      header.style.display = 'block';
  
      inputs.forEach(input => (input.disabled = false));
  
      // Display the welcome message if chat-log is empty
      if (chatLog.innerHTML.trim() === '') {
        updateChatLog("Welcome, please enter your email ID.", "bot");
      }
  
      // Move chatbox upwards to simulate coming from the button
      chatbox.style.transform = 'translateY(-15%)';
      assistantLogo.style.transform = 'scale(0.8)';
    } else {
      chatbox.classList.add('minimized');
      chatbox.classList.remove('visible');
      chatbox.style.display = 'flex';
      header.style.display = 'none';
  
      inputs.forEach(input => (input.disabled = true));
  
      // Move chatbox back down to the button
      chatbox.style.transform = 'translateY(100%)';
      assistantLogo.style.transform = 'scale(1)';
    }
  }
  
  // Initialize chat-log with a welcome message on page load
  document.addEventListener('DOMContentLoaded', () => {
    const chatLog = document.getElementById('chat-log');
    if (chatLog.innerHTML.trim() === '') {
      updateChatLog("Welcome, please enter your email ID.", "bot");
    }
  });
  
  async function requestOTP() {
    const email = document.getElementById('user-email').value.trim();
    if (!email) {
      updateChatLog("Please enter a valid email.", "bot");
      return;
    }
  
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      updateChatLog("Please enter a valid email address.", "bot");
      return;
    }
  
    updateChatLog(`Email entered: ${email}`, "user");
  
    try {
      const response = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      updateChatLog(data.message, "bot");
      if (data.success) {
        document.getElementById('email-section').style.display = 'none';
        document.getElementById('otp-section').style.display = 'flex';
      }
    } catch (error) {
      console.error("Error sending OTP:", error);
      updateChatLog("An error occurred while sending the OTP. Please try again.", "bot");
    }
  }
  
  async function verifyOTP() {
    const email = document.getElementById('user-email').value.trim();
    const otp = document.getElementById('otp-code').value.trim();
  
    if (!otp) {
      updateChatLog("Please enter OTP.", "bot");
      return;
    }
  
    updateChatLog(`Entered OTP: ${otp}`, "user");
  
  
    try {
      const response = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await response.json();
      updateChatLog(data.message, "bot");
      if (data.success) {
        document.getElementById('otp-section').style.display = 'none';
        document.getElementById('domain-section').style.display = 'flex';
      }
    } catch (error) {
      console.error("Error verifying OTP:", error);
      updateChatLog("An error occurred while verifying OTP. Please try again.", "bot");
    }
  }
  
  // Resend OTP
  async function resendOTP() {
    const email = document.getElementById('user-email').value.trim();
  
    if (!email) {
      updateChatLog("Please enter a valid email first.", "bot");
      return;
    }
  
    updateChatLog(`Resending OTP to: ${email}`, "user");
  
  
    try {
      const response = await fetch('/api/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      updateChatLog(data.message, "bot");
    } catch (error) {
      console.error("Error resending OTP:", error);
      updateChatLog("An error occurred while resending the OTP. Please try again.", "bot");
    }
  }
  
  async function getDomainSuggestions() {
    const email = document.getElementById('user-email').value.trim();
    const domain = document.getElementById('domain-name').value.trim();
  
    if (!domain) {
      updateChatLog("Please enter a domain name.", "bot");
      return;
    }
  
    updateChatLog(`Domain entered: ${domain}`, "user");
  
  
    try {
      const response = await fetch('/api/domain-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, domain }),
      });
      const data = await response.json();
      updateChatLog(data.message, "bot");
  
      if (data.success) {
        // Only display the suggestions
        const suggestionsList = data.suggestions.join("<br>");
        updateChatLog(suggestionsList, "bot"); // This will show only the domain suggestions
  
        document.getElementById('domain-section').style.display = 'none';
        document.getElementById('chatbot-section').style.display = 'flex';
      }
    } catch (error) {
      console.error("Error getting domain suggestions:", error);
      updateChatLog("An error occurred while fetching domain suggestions. Please try again.", "bot");
    }
  }
  
  async function askChatbot() {
    const email = document.getElementById('user-email').value.trim();
    const query = document.getElementById('chatbot-query').value.trim();
  
    if (!query) {
      updateChatLog("Please enter a query.", "bot");
      return;
    }
  
    updateChatLog(query, "user");
  
  
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, query }),
      });
      const data = await response.json();
  
      if (data.success) {
        updateChatLog(data.answer || "Sorry, I couldn't answer your question.", "bot");
      } else {
        updateChatLog("An error occurred while asking the chatbot. Please try again.", "bot");
      }
    } catch (error) {
      console.error("Error asking chatbot:", error);
      updateChatLog("An error occurred while asking the chatbot. Please try again.", "bot");
    }
  }
  
  // Event listeners for Enter key submission
  document.getElementById('user-email').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      requestOTP();
    }
  });
  
  document.getElementById('otp-code').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      verifyOTP();
    }
  });
  
  document.getElementById('domain-name').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      getDomainSuggestions();
    }
  });
  
  document.getElementById('chatbot-query').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      askChatbot();
    }
  });
  