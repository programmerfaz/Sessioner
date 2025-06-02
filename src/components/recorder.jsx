import React, { useState, useRef } from 'react';
import '../App.css';

const AudioRecorder = () => {
    const [status, setStatus] = useState('idle'); // State to manage recording status: idle, recording, paused
    const [audioURL, setAudioURL] = useState(null); // State to hold the audio URL for playback
    const [recordTime, setRecordTime] = useState(0); // State to hold the recording time in seconds
    const [transcript, setTranscript] = useState(''); // State to hold the transcription text
    const [loading, setLoading] = useState(false); // State to manage loading state for transcription

    const mediaRecorderRef = useRef(null);
    const chunks = useRef([]); // Ref to hold audio data chunks
    const intervalRef = useRef(null);
    const recordedBlobRef = useRef(null); // Ref to hold the recorded audio blob
    const fileInputRef = useRef(null); // Ref to hold the file input element
    const [summary, setSummary] = useState(''); // State to hold the summary of the transcription
    const [summaryLoading, setSummaryLoading] = useState(false); // State to manage loading state for summary generation
    const [keyPoints, setKeyPoints] = useState([]); // State to hold key points extracted from the transcription
    const [selectedLanguage, setSelectedLanguage] = useState('en'); // Default English


    // fucntiion to start recording and add intervals pause and resume
    const startRecording = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);

        mediaRecorderRef.current.ondataavailable = (e) => {
            chunks.current.push(e.data);
        };

        mediaRecorderRef.current.onstop = () => {
            const blob = new Blob(chunks.current, { type: 'audio/webm' });
            recordedBlobRef.current = blob;
            const url = URL.createObjectURL(blob);
            setAudioURL(url);
            chunks.current = [];
            clearInterval(intervalRef.current);
            setRecordTime(0);
            setStatus('idle');
        };
        // this is for timer like what was the duration of the recording
        mediaRecorderRef.current.start();
        setStatus('recording');
        intervalRef.current = setInterval(() => {
            setRecordTime((prev) => prev + 1);
        }, 1000);
    };

    // functions to pause, resume and stop the recording
    // pauseRecording pauses the recording and clears the interval
    const pauseRecording = () => {
        mediaRecorderRef.current.pause();
        clearInterval(intervalRef.current);
        setStatus('paused');
    };

    // resumeRecording resumes the recording and starts the interval again
    const resumeRecording = () => {
        mediaRecorderRef.current.resume();
        setStatus('recording');
        intervalRef.current = setInterval(() => {
            setRecordTime((prev) => prev + 1);
        }, 1000);
    };

    // stopRecording stops the recording, clears the interval and resets the record time
    const stopRecording = () => {
        mediaRecorderRef.current.stop();
        clearInterval(intervalRef.current);
    };

    // clearAudio resets the audio URL, recorded blob, transcript, summary, key points and status
    const clearAudio = () => {
        setAudioURL(null);
        recordedBlobRef.current = null;
        setTranscript('');
        setSummary('');
        setKeyPoints([]);
        setStatus('idle');
        setRecordTime(0);
        setSummaryLoading(false);

        // Reset file input so the same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = null;
        }
    };

    const formatTime = (time) => {
        const m = String(Math.floor(time / 60)).padStart(2, '0');
        const s = String(time % 60).padStart(2, '0');
        return `${m}:${s}`;
    };

    const transcribeAudio = async () => {
        if (!recordedBlobRef.current) return alert('No audio to transcribe!');
        setLoading(true);
        setTranscript('');
        setSummary('');
        setKeyPoints([]);
        setSummaryLoading(true);

        // Create a new File object from the recorded blob
        // Ensure the file type is set correctly
        const file = new File([recordedBlobRef.current], 'audio.webm', {
            type: recordedBlobRef.current.type || 'audio/webm',
        });

        const formData = new FormData();
        formData.append('file', file);
        formData.append('model', 'whisper-1');

        //creating transcription request
        // Ensure the API key is set correctly
        try {
            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`, // ✅ Fix applied here
                },
                body: formData,
            });

            const result = await response.json();
            const fullTranscript = result.text || 'No transcription returned';
            setTranscript(fullTranscript);
            setLoading(false);

            let translatedText = fullTranscript;

            if (selectedLanguage !== 'en') {
                const translationRes = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: 'gpt-3.5-turbo',
                        messages: [
                            {
                                role: 'system',
                                content: `Translate the following transcript to ${selectedLanguage}.`,
                            },
                            {
                                role: 'user',
                                content: fullTranscript,
                            },
                        ],
                        temperature: 0.3,
                        max_tokens: 1000,
                    }),
                });

                const translationData = await translationRes.json();
                translatedText = translationData.choices?.[0]?.message?.content || fullTranscript;
            }

            setTranscript(translatedText);


            //summarize the transcription
            // 1- summarize the transcription
            setSummaryLoading(true);
            const summaryResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a concise summarizer. Provide a short, clear summary of the user\'s input. Make sure to transalate the text to ${selectedLanguage}`,
                        },
                        {
                            role: 'user',
                            content: `Summarize the following transcript in 3-4 sentences:Make sure to transalate the text to ${selectedLanguage} with the following text given \n\n${translatedText}`,
                        },
                    ],
                    temperature: 0.3,
                    max_tokens: 200,
                }),
            });
            const summaryData = await summaryResponse.json();
            const summaryText = summaryData.choices?.[0]?.message?.content || 'No summary returned';
            setSummary(summaryText);
            setSummaryLoading(false);

            // 2- extract key points from the transcription
            const bulletRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an assistant that extracts only important announcements from a transcript.',
                        },
                        {
                            role: 'user',
                            content: `
From the transcript below, extract ONLY the most important announcements or action items such as:
- Upcoming tests,quiz or exams
- Project deadlines
- Important meetings
- New hires or firings
- Launch dates
Ignore casual discussions, general information, or unrelated content. dont assume anything and dont just add any text from your own just use the transcript to extract the key points. Make sure to translate the text to ${selectedLanguage} before extracting key points.

Format the results as bullet points.

Transcript:
${translatedText}
                `,
                        },
                    ],
                    temperature: 0.3,
                    max_tokens: 300,
                }),
            });

            const bulletData = await bulletRes.json();
            const bulletText = bulletData.choices?.[0]?.message?.content || '';
            const bullets = bulletText
                .split('\n')
                .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'));
            setKeyPoints(bullets);

        } catch (err) {
            console.error(err);
            alert('Error during transcription');
        } finally {
            setLoading(false);
            setSummaryLoading(false);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            recordedBlobRef.current = file;
            const url = URL.createObjectURL(file);
            setAudioURL(url);
            setTranscript('');
            setStatus('idle');
            setRecordTime(0);
        }
    };

    return (
        <div className="p-4 space-y-4 justify-center items-center  rounded-lg shadow-lg max-w-6xl mx-auto mt-10">
            <h2 className="text-4xl font-bold mb-4 text-sky-950">🎙️ Audio Recorder</h2>
            <div className="space-x-2">
                <div className='flex flex-col md:flex-row gap-4 p-4 max-w-4xl mx-auto w-full justify-center items-center'>
                    {status === 'idle' && (
                        <>
                            <button onClick={startRecording} className="w-full sm:w-auto bg-sky-950 text-white px-4 py-2 rounded mr-6 text-lg font-semibold cursor-pointer hover:bg-stone-800 transition-colors duration-300 mb-5">
                                🎤 Start Recording
                            </button>
                            <button
                                onClick={() => fileInputRef.current.click()}
                                className="w-full sm:w-auto bg-sky-950 text-white px-4 py-2 rounded mr-6 text-lg font-semibold cursor-pointer hover:bg-stone-800 transition-colors duration-300 mb-5"
                            >
                                ➕ Upload Audio File
                            </button>
                            <input
                                type="file"
                                accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm"
                                ref={fileInputRef}
                                onChange={handleFileSelect}
                                style={{ display: 'none' }}
                            />
                        </>
                    )}
                    {status === 'recording' && (
                        <>
                            <button onClick={pauseRecording} className="w-full sm:w-auto bg-green-600 text-white px-4 py-2 rounded mr-6 text-lg font-semibold cursor-pointer hover:bg-stone-800 transition-colors duration-300 mb-5">
                                Pause
                            </button>
                            <button onClick={stopRecording} className="w-full sm:w-auto bg-red-950 text-white px-4 py-2 rounded mr-6 text-lg font-semibold cursor-pointer hover:bg-stone-800 transition-colors duration-300 mb-5">
                                Stop
                            </button>
                        </>
                    )}
                    {status === 'paused' && (
                        <>
                            <button onClick={resumeRecording} className="w-full sm:w-auto bg-green-300 text-white px-4 py-2 rounded mr-6 text-lg font-semibold cursor-pointer hover:bg-green-600 transition-colors duration-300 mb-5">
                                Resume
                            </button>
                            <button onClick={stopRecording} className="w-full sm:w-auto bg-red-300 text-white px-4 py-2 rounded mr-6 text-lg font-semibold cursor-pointer hover:bg-red-600 transition-colors duration-300 mb-5">
                                Stop
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* {(status === 'recording' || status === 'paused') && (
                <div className="text-red-600 font-semibold text-center">
                    Recording Time: {formatTime(recordTime)}
                </div>
            )} */}
            <div className='text-center'>
                <label className="text-center text-white font-bold px-4 py-2 mr-6 text-3xl">🌐 Translate to</label>
                <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="text-center p-2 border rounded font-bold text-lg bg-white text-black bg-green-300"
                >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="ar">Arabic</option>
                    <option value="zh">Chinese</option>
                    <option value="hi">Hindi</option>
                    <option value="ja">Japanese</option>
                    <option value="ru">Russian</option>
                    <option value="pt">Portuguese</option>
                </select>
            </div>


            {audioURL && (
                <div className="space-y-3">
                    <div className='flex flex-row items-center justify-center'>
                        <h3 className="text-white px-4 py-2 mr-6 mb-2 mt-5 text-xl font-bold">🎧 Preview:</h3>
                        <audio controls src={audioURL} />
                    </div>
                    <div className="flex text-white font-semibold text-center justify-flex justify-between w-full">
                        <div className="space-x-2 flex text-white font-semibold text-center justify-flex justify-between w-full">
                            <button
                                onClick={transcribeAudio}
                                className="bg-sky-600 text-white font-bold px-4 py-2 rounded cursor-pointer hover:bg-sky-800 transition-colors duration-300"
                                disabled={loading}
                            >
                                {loading ? 'Transcribing...' : 'Transcribe Audio'}
                            </button>
                            <button
                                onClick={summaryLoading ? null : transcribeAudio}
                                className="bg-green-600 text-white font-bold px-4 py-2 rounded cursor-pointer hover:bg-green-900 transition-colors duration-300"
                            >
                                <h3 className="font-semibold mb-2">📄 Generate Summary</h3>
                            </button>
                            <button
                                onClick={clearAudio}
                                className="bg-red-400 text-white font-bold px-4 py-2 rounded cursor-pointer hover:bg-red-600 transition-colors duration-300"
                            >
                                Clear Audio
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {transcript && (
                <div className="bg-emerald-100 p-3 rounded mt-4 ">
                    <h3 className="font-semibold mb-2">📝 Transcription:</h3>
                    <p>{transcript}</p>
                </div>
            )}
            {(summary || summaryLoading) && (
                <div className="bg-yellow-100 p-3 rounded mt-4">
                    <h3 className="font-semibold mb-2">📄 Summary:</h3>
                    <p>{summaryLoading ? 'Generating summary...' : summary}</p>
                </div>
            )}
            {keyPoints.length > 0 && (
                <div className="bg-emerald-100 p-3 rounded mt-4 mb-5">
                    <h3 className="font-semibold mb-2">📌 Announcements / Action Items:</h3>
                    <ul className="list-disc list-inside">
                        {keyPoints.map((point, index) => (
                            <li key={index}>{point.replace(/^[-•]\s*/, '')}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default AudioRecorder;
