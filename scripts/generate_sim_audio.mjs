/**
 * Generates the pre-recorded clips for the simulation story.
 *
 * Separate from `generate_audio_prompts.mjs` on purpose: that file owns the live 16699
 * prompts, and the simulation needs BOTH sides of a conversation (a blind caller speaks,
 * so his voice IS the channel) plus narration for the stages that happen off-call. Mixing
 * the two sets would make the filter argument ambiguous and risk regenerating a live
 * prompt.
 *
 * Borrows the deployed worker's /v1/tts proxy, so no local SONIOX_API_KEY is needed.
 * THIS SPENDS SONIOX CREDITS — one synthesis per clip, once. After that the simulation
 * replays local files and costs nothing, which is what makes it safe to run in front of
 * judges repeatedly.
 *
 *   node scripts/generate_sim_audio.mjs            # all clips
 *   node scripts/generate_sim_audio.mjs moyuri     # only the Moyuri/Ripon story
 */
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const TTS_URL = "wss://legal-voice-agent.adribmahmud.workers.dev/v1/tts";
const outDir = path.join(process.cwd(), "public", "audio", "sim");

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
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(TTS_URL);
    ws.binaryType = "arraybuffer";
    const chunks = [];
    let settled = false;

    const save = () => {
      if (!chunks.length) return false;
      const wav = createWavBuffer(chunks);
      fs.writeFileSync(outPath, wav);
      const seconds = (wav.length - 44) / 48000;
      console.log(`   saved ${path.basename(outPath)} — ${seconds.toFixed(1)}s, ${(wav.length / 1024).toFixed(0)}KB`);
      return true;
    };

    const finish = () => {
      if (settled) return;
      if (!save()) return;
      settled = true;
      clearTimeout(timeout);
      ws.close();
      resolve();
    };

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.close();
      if (save()) resolve();
      else reject(new Error(`timeout: ${outPath}`));
    }, 45000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "Speak", text }));
      ws.send(JSON.stringify({ type: "Flush" }));
    };
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer || Buffer.isBuffer(event.data)) {
        const chunk = Buffer.from(event.data);
        if (chunk.length) chunks.push(chunk);
        return;
      }
      try {
        const msg = JSON.parse(event.data.toString());
        if (msg.type === "Flushed" || msg.type === "Finished" || msg.done) finish();
      } catch {
        /* control frames we do not need */
      }
    };
    ws.onerror = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    };
  });
}

/**
 * The Moyuri / Ripon story, beat by beat.
 *
 * `speaker: "narrator"` lines are the system's own voice explaining what just happened
 * off-call — the stages a voice agent cannot show by itself, like a DLAO reading a summary
 * or a paralegal arriving inside a 15-minute window.
 */
const CLIPS = [
  // ---- phase 1: the call to 16699 ----
  { name: "moyuri_01_greeting.wav", speaker: "agent", text: "জাতীয় আইনগত সহায়তা প্রদান সংস্থা, ডিজিটাল লিগ্যাল এইড সিস্টেম। আপনার কথা রেকর্ড করা হচ্ছে। আপনি বাংলায় কথা বলবেন, নাকি মারমা বা চাকমায়?" },
  { name: "moyuri_02_caller_lang.wav", speaker: "caller", text: "বাংলায় কথা বলব।" },
  { name: "moyuri_03_menu.wav", speaker: "agent", text: "আপনার জন্য কোন বিষয়ে সহায়তা চান? এক নম্বর সাধারণ তথ্য ও নিয়মাবলী, দুই নম্বর আপনার সমস্যা ও আবেদন, তিন নম্বর মামলা ট্র্যাকিং।" },
  { name: "moyuri_04_caller_route.wav", speaker: "caller", text: "দুই।" },
  { name: "moyuri_05_problem_prompt.wav", speaker: "agent", text: "আপনার সমস্যাটি বলুন, আমি শুনছি।" },
  {
    name: "moyuri_06_problem.wav",
    speaker: "caller",
    text: "আমার বোন মোয়ূরীর স্বামী তাকে নিয়মিত মারধর করেন, চড় মারেন, আর বাড়ি থেকে বের করে দিয়েছেন। মোয়ূরী এখন আমার কাছে আছে। আমি তার ভাই রিপন, আমি তার হয়ে ফোন করেছি। বাড়িতে স্বামী ফোন দেখেন, মোয়ূরী নিজে ফোন করতে পারে না। তার জাতীয় পরিচয়পত্রও নেই, কাগজপত্র স্বামীর কাছে। আমি চাই সে নিরাপদে থাকুক এবং আইনি সুরক্ষা পাক।",
  },
  {
    name: "moyuri_07_ack.wav",
    speaker: "agent",
    text: "আপনার বোনের জন্য জরুরি সহায়তা নিশ্চিত করা হয়েছে। তবে একটি কথা পরিষ্কার করে নিই। মোয়ূরীর নিজের কথা এখনো নথিভুক্ত হয়নি। আপনি তার হয়ে আবেদন করতে পারেন, কিন্তু যেটুকু তিনি নিজে নিশ্চিত করেননি, সেটুকু আমরা তার কথা হিসেবে লিখব না।",
  },
  { name: "moyuri_08_closing.wav", speaker: "agent", text: "আবেদন নম্বর এবং পরবর্তী ধাপ এই কথায় আবার বলা হবে। মোয়ূরী নিরাপদ সময়ে আমাদের কল পেলে তার নিজের কথা যুক্ত হবে।" },

  // ---- phase 2: the DLAO console ----
  { name: "moyuri_09_flagged.wav", speaker: "narrator", text: "কথোপকথন শেষ। কর্মকর্তার কনসোলে আবেদনটি জরুরি হিসেবে চিহ্নিত হয়েছে। সিস্টেম প্রতিটি বাক্য থেকে চারটি আলাদা সংকেত বের করেছে। পারিবারিক সহিংসতা, নিয়ন্ত্রিত যোগাযোগ, অনুপলব্ধ পরিচয়, এবং প্রতিনিধিত্ব।" },

  // ---- phase 3: the 15-minute window ----
  { name: "moyuri_10_window.wav", speaker: "narrator", text: "স্বামী ফোন দেখেন বলে মোয়ূরীর সঙ্গে যোগাযোগ করা যায় শুধু প্রতিদিন সকাল এগারটা থেকে এগারটা পনেরো মিনিট। এই পনেরো মিনিট ছাড়া সিস্টেম কোনো কল বা বার্তা পাঠাবে না।" },
  { name: "moyuri_11_para.wav", speaker: "narrator", text: "পরালেগাল আইনি সহায়তা কর্মকর্তা নিরাপদ সময়ে মোয়ূরীর কাছে পৌঁছেছেন। স্বামীর নম্বরে একটিও বার্তা যায়নি।" },

  // ---- phase 4: identity ----
  { name: "moyuri_12_nid.wav", speaker: "narrator", text: "নিকটতম নিবন্ধন কেন্দ্র থেকে মোয়ূরীর জাতীয় পরিচয়পত্র নিবন্ধন করা হয়েছে। প্রতিনিধির কথা আর মোয়ূরীর নিজের বক্তব্য নথিতে আলাদা ভাগে সংরক্ষিত।" },

  // ---- phase 5: mediation booking ----
  { name: "moyuri_13_mediation.wav", speaker: "narrator", text: "কর্মকর্তা মধ্যস্থতার তারিখ নির্ধারণ করেছেন। নির্বাচিত তারিখটি কার্যদিবস, এবং সময়টি মোয়ূরীর নিরাপদ সময়ের মধ্যে রাখা হয়েছে।" },
  { name: "moyuri_14_mediator.wav", speaker: "narrator", text: "বিশেষ মধ্যস্থতাকারী কেসটি গ্রহণ করেছেন। তিনি গ্রহণ না করলে ক্ষতিপূরণ বিবেচনা করা হতো না।" },

  // ---- phase 6: the mediation and its outcome ----
  { name: "moyuri_15_session.wav", speaker: "narrator", text: "মধ্যস্থতা অনুষ্ঠিত হয়েছে। উভয় পক্ষের কথা নথিভুক্ত এবং একটি অংশে সমঝোতা হয়েছে।" },
  { name: "moyuri_16_settled.wav", speaker: "narrator", text: "সালিশ হয়েছে। সিস্টেম এখন সালিশ সনদ প্রস্তুত করছে।" },

  // ---- phase 7: the AI documents the settlement ----
  { name: "moyuri_17_draft.wav", speaker: "narrator", text: "সালিশ সনদের প্রতিটি অংশ কেস নথি থেকে তৈরি হচ্ছে। যে অংশের উৎস নথিতে নেই, সেটি ফাঁকা রাখা হচ্ছে। কারণ সালিশ সনদ একটি বাস্তবায়নযোগ্য দলিল, তাই নথিতে না থাকা কোনো শর্ত বানিয়ে লেখা হবে না।" },
  { name: "moyuri_18_sign.wav", speaker: "narrator", text: "চারটি অংশ এখনো নির্ধারিত হয়নি। এগুলো না ছাড়া কেউ স্বাক্ষর করবেন না। তিন পক্ষ স্বাক্ষর করলেই প্রধান কর্মকর্তা প্রতিপালন করবেন।" },
  { name: "moyuri_19_outcome.wav", speaker: "narrator", text: "মোয়ূরী নিরাপদে আছেন, তার কথা নথিতে নিজের মুখে যুক্ত হয়েছে, এবং আইনি সুরক্ষার প্রক্রিয়া শুরু হয়েছে।" },

  // ---- the other four personas, opening lines only ----
  { name: "nabila_01_greeting.wav", speaker: "agent", text: "জাতীয় আইনগত সহায়তা প্রদান সংস্থা। আপনার কথা রেকর্ড করা হচ্ছে। কোন ভাষায় কথা বলবেন?" },
  { name: "nabila_02_problem.wav", speaker: "caller", text: "আমার একজন পুরোনো সহপাঠী আমার ছবি বদলে অশ্লীল মেসেজ পাঠাচ্ছেন এবং আমাকে ভয় দিচ্ছেন। আমার ছবি অন্যদের কাছে ছড়িয়ে দেওয়া হচ্ছে। আমি খুব ভয় পাচ্ছি।" },
  { name: "ripon_01_greeting.wav", speaker: "agent", text: "জাতীয় আইনগত সহায়তা প্রদান সংস্থা। আপনার কথা রেকর্ড করা হচ্ছে। কোন ভাষায় কথা বলবেন?" },
  { name: "ripon_02_problem.wav", speaker: "caller", text: "আমি দৃষ্টিহীন, ফরম বা পিডিএফ আমি পড়তে পারি না, এবং ভিজ্যুয়াল ওটিপি ব্যবহার করতে পারি না। আমার পিতার রেখে যাওয়া জমি নিয়ে আমার ভাই আমাকে ঠকাতে চাইছেন।" },
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const filter = process.argv[2];
  const selected = filter ? CLIPS.filter((c) => c.name.includes(filter)) : CLIPS;
  if (!selected.length) {
    console.error(`No clips matched "${filter}"`);
    process.exit(1);
  }
  console.log(`Generating ${selected.length} clip(s) into public/audio/sim via the deployed TTS proxy.\n`);
  for (const clip of selected) {
    const target = path.join(outDir, clip.name);
    if (fs.existsSync(target) && fs.statSync(target).size > 1000) {
      console.log(`   skip ${clip.name} (already present)`);
      continue;
    }
    try {
      await synthesizeToFile(clip.text, target);
    } catch (err) {
      console.error(`   FAILED ${clip.name}: ${err?.message ?? err}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const made = fs.readdirSync(outDir).filter((f) => f.endsWith(".wav"));
  console.log(`\nDone. ${made.length} clip(s) in public/audio/sim.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
