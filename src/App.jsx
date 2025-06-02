import React from 'react';
import AudioRecorder from './components/recorder';
import './App.css';

function App() {
  
  return (
    <div>
      <div>
        <h1 className="text-6xl font-bold text-center mt-5 text-white">
          Audio Transcription Studio
        </h1>
        <p className="text-center mt-4 text-2xl font-normal text-black mb-5">
          Record, upload, and transcribe audio with AI-powered accuracy.
        </p>
      </div>
      <AudioRecorder />
    </div>
  );
}

export default App;