import fs from 'fs';
import path from 'path';

// Load API key from environment — set SONIOX_API_KEY before running
// OR this script auto-connects to the deployed worker at /v1/tts (no key needed)
const apiKey = process.env.SONIOX_API_KEY || "";

function createWavBuffer(pcmBuffers, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const totalPcmLength = pcmBuffers.reduce((sum, b) => sum + b.length, 0);
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + totalPcmLength, 4);
  header.write("WAVE", 8);

  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);

  header.write("data", 36);
  header.writeUInt32LE(totalPcmLength, 40);

  return Buffer.concat([header, ...pcmBuffers]);
}

async function synthesizeToFile(text, outPath) {
  console.log(`Synthesizing: "${text}" -> ${outPath}`);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://legal-voice-agent.adribmahmud.workers.dev/v1/tts");

    const pcmChunks = [];
    const streamId = "s_" + Date.now();
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Timeout synthesizing audio"));
    }, 15000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        stream_id: streamId,
        model: "tts-rt-v2",
        language: "bn",
        voice: "Priya",
        audio_format: "pcm_s16le",
        sample_rate: 24000
      }));
      ws.send(JSON.stringify({
        stream_id: streamId,
        text: text,
        text_end: true
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.error_code) {
          console.error("Soniox Error:", msg.error_code, msg.error_message);
        }
        if (msg.audio) {
          const buf = Buffer.from(msg.audio, 'base64');
          pcmChunks.push(buf);
        }
        if (msg.end_of_stream || msg.text_end) {
          clearTimeout(timeout);
          ws.close();
          const wav = createWavBuffer(pcmChunks);
          fs.writeFileSync(outPath, wav);
          console.log(`Saved ${outPath} (${wav.length} bytes, duration: ${(wav.length - 44) / 48000}s)`);
          resolve();
        }
      } catch (err) {
        console.error("Message parse err:", err);
      }
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      if (pcmChunks.length > 0 && !fs.existsSync(outPath)) {
        const wav = createWavBuffer(pcmChunks);
        fs.writeFileSync(outPath, wav);
        console.log(`Saved on close: ${outPath} (${wav.length} bytes)`);
        resolve();
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
  });
}

async function main() {
  const audioDir = path.join(process.cwd(), "public", "audio");
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  const prompts = [
    {
      name: "inactivity_app_query.wav",
      text: "আপনি কি সরকারি আইনি সহায়তার জন্য কোনো আবেদন বা অভিযোগ নথিভুক্ত করতে চান? হ্যাঁ অথবা না বলুন, অথবা আপনার অন্য কোনো প্রশ্ন থাকলে করতে পারেন।"
    },
    {
      name: "inactivity_no_ack.wav",
      text: "ঠিক আছে, আমি শুনছি। আপনার যেকোনো আইনি প্রশ্ন বা পরামর্শের প্রয়োজন হলে নির্দ্বিধায় বলুন, আমি সাহায্য করছি।"
    },
    {
      name: "inactivity_hangup.wav",
      text: "দীর্ঘক্ষণ কোনো সাড়া না পাওয়ায় কলটি শেষ করা হচ্ছে। যেকোনো আইনি তথ্যের জন্য ১৬৬৯৯ নম্বরে আবার কল করুন। বাংলাদেশ লিগ্যাল এইডের সাথে থাকার জন্য ধন্যবাদ।"
    }
  ];

  for (const item of prompts) {
    const targetFile = path.join(audioDir, item.name);
    await synthesizeToFile(item.text, targetFile);
    await new Promise(r => setTimeout(r, 600));
  }

  console.log("All audio prompts generated successfully!");
}

main().catch(err => {
  console.error("Error generating audio:", err);
  process.exit(1);
});
