# Voice Memo App

This web app allows you to record a voice memo, which is then transcribed, analyzed, and formatted into a lesson note. The final text is automatically copied to your clipboard.

## Setup and Installation

Follow these steps to set up and run the project locally.

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (which includes npm) installed on your machine.
- API keys for [OpenAI](https://platform.openai.com/api-keys) and [Anthropic](https://console.anthropic.com/settings/keys).

### 2. Clone the Repository

Clone this project to your local machine or download the source code.

### 3. Navigate to the Project Directory

Open your terminal and change your directory to the project's root folder:

```bash
cd path/to/voice-memo-app
```

### 4. Install Dependencies

Run the following command to install the necessary server-side dependencies:

```bash
npm install
```

### 5. Set Up Environment Variables

You need to provide your API keys to the application. To do this, create a file named `.env` in the root of the project directory.

Your `.env` file should look exactly like this, but with your actual keys:

```
# Replace with your actual API keys
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

**Important:** Do not share your `.env` file or commit it to version control. The `.gitignore` file is already configured to ignore it.

### 6. Run the Application

Start the local server with this command:

```bash
npm start
```

You should see a message in your terminal indicating that the server is running:

```
Server listening at http://localhost:3000
```

### 7. Use the App

Open your web browser and navigate to [http://localhost:3000](http://localhost:3000). You will see the simple interface.

- Click **Record** to start recording your voice memo. You may need to grant your browser permission to access the microphone.
- Click **Stop** when you are finished.
- The app will display status updates ("Transcribing...", "Analyzing...").
- Once finished, the formatted text will be copied to your clipboard automatically. You can then paste it into any other application. 