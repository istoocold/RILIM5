function grab() {
  const head = document.title;
  const link = window.location.href;
  
  if (link.includes("youtube.com/watch") || link.includes("youtu.be/")) {
    let vid = "";
    if (link.includes("youtube.com/watch?v=")) {
      vid = link.split("v=")[1].split("&")[0];
    } else if (link.includes("youtu.be/")) {
      vid = link.split("youtu.be/")[1].split("?")[0];
    }
    
    let info = "";
    const box = document.querySelector("#description-inline-expander") ||
                document.querySelector("#description yt-formatted-string") ||
                document.querySelector("#description") ||
                document.querySelector('meta[name="description"]');
    
    if (box) {
      info = box.textContent || box.getAttribute("content") || "";
    }
    
    let author = "";
    const name = document.querySelector("#channel-name a") ||
                 document.querySelector("ytd-channel-name a") ||
                 document.querySelector("#owner-name a");
    if (name) {
      author = name.textContent.trim();
    }

    let time = "";
    const timer = document.querySelector(".ytp-time-duration");
    if (timer) {
      time = timer.textContent;
    }

    let extra = "";
    const more = document.querySelector("#structured-description");
    if (more) {
      extra = more.textContent || "";
    }
    
    return {
      title: head.replace(" - YouTube", ""),
      text: "Channel: " + author + "\nDuration: " + time + "\n\nDescription: " + info + "\n\nAdditional Info: " + extra,
      url: link,
      videoId: vid,
      channel: author,
      duration: time,
      type: 'video'
    };
  }
  
  let words = "";
  const main = document.querySelector("article") || 
               document.querySelector("main") ||
               document.querySelector('[role="main"]') ||
               document.body;
  
  const parts = main.querySelectorAll("p, h1, h2, h3, h4, li");
  words = Array.from(parts)
    .map(function(el) { return el.innerText.trim(); })
    .filter(function(t) { return t.length > 20; })
    .join("\n\n");
  
  if (words.length < 100) {
    words = document.body.innerText;
  }
  
  if (words.length > 10000) {
    words = words.substring(0, 10000) + "...";
  }
  
  return { 
    title: head, 
    text: words,
    url: link,
    type: 'page'
  };
}

document.addEventListener('DOMContentLoaded', function() {
  const sum = document.getElementById("summaryBtn");
  const ask = document.getElementById("askBtn");
  const pdf = document.getElementById("pdfBtn");
  const query = document.getElementById("question");
  const wait = document.getElementById("loading");
  const output = document.getElementById("result");
  const fail = document.getElementById("error");
  const label = document.getElementById("summaryText");

  let mode = "finance";
  let data = null;
  let isvid = false;
  let saved = null;

  document.querySelector('[data-mode="finance"]').classList.add("active");

  document.querySelectorAll(".category-tile").forEach(tile => {
    tile.addEventListener("click", function() {
      document.querySelectorAll(".category-tile").forEach(t => t.classList.remove("active"));
      this.classList.add("active");
      mode = this.dataset.mode;
    });
  });

  function hide() {
    fail.classList.add("hidden");
  }

  function show(msg) {
    fail.textContent = "⚠️ " + msg;
    fail.classList.remove("hidden");
    wait.classList.add("hidden");
    sum.disabled = false;
    ask.disabled = false;
  }

  function display(text) {
    output.textContent = text;
    output.classList.remove("hidden");
    wait.classList.add("hidden");
    sum.disabled = false;
    ask.disabled = false;
  }

  function busy() {
    wait.classList.remove("hidden");
    output.classList.add("hidden");
    fail.classList.add("hidden");
    sum.disabled = true;
    ask.disabled = true;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const link = tabs[0].url;
    isvid = link.includes("youtube.com/watch") || link.includes("youtu.be/");
    
    if (isvid) {
      label.textContent = "Summarize this video";
    } else {
      label.textContent = "Explain this";
    }

    inject(tabs[0].id);
  });

  function inject(tab) {
    chrome.scripting.executeScript({
      target: { tabId: tab },
      files: ['content.js']
    }).catch(function(err) {});
  }

  async function talk(words, tokens) {
    const key = "sk-hc-v1-6810d0411e3d4815b2acb0544c974f41e46bedbbe93e4c20948a7e0e79ad4723";
    
    const resp = await fetch("https://ai.hackclub.com/proxy/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-preview-05-20",
        messages: [
          {
            role: "user",
            content: words
          }
        ],
        max_tokens: tokens
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error("API error: " + resp.status);
    }
    
    const result = await resp.json();
    return result.choices[0].message.content;
  }

  function getContent() {
    return new Promise(function(resolve, reject) {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const tab = tabs[0];
        
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }).then(function() {
          setTimeout(function() {
            chrome.tabs.sendMessage(
              tab.id,
              { action: "getContent" },
              function(response) {
                if (chrome.runtime.lastError) {
                  chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: grab
                  }).then(function(results) {
                    if (results && results[0] && results[0].result) {
                      resolve(results[0].result);
                    } else {
                      reject(new Error("Could not extract page content"));
                    }
                  }).catch(function(err) {
                    reject(new Error("Cannot access this page"));
                  });
                  return;
                }
                if (response) {
                  resolve(response);
                } else {
                  reject(new Error("No content received"));
                }
              }
            );
          }, 100);
        }).catch(function(err) {
          reject(new Error("Cannot access this page"));
        });
      });
    });
  }

  async function explain(content, question) {
    const guides = {
      finance: "You are a financial expert. Answer this question about the content with a focus on financial implications.",
      tech: "You are a tech expert. Answer this question with clear technical explanations.",
      general: "You are a helpful assistant. Answer this question clearly and simply.",
      science: "You are a science expert. Answer with scientific accuracy but in simple terms.",
      medicine: "You are a medical professional. Answer health-related questions carefully and clearly.",
      legal: "You are a legal expert. Answer with legal accuracy but in plain language."
    };

    const text = `${guides[mode]}

PAGE TITLE: ${content.title}

CONTENT:
${content.text}

QUESTION: ${question}

Give a detailed, clear, and helpful answer using simple language. If the answer isn't in the content, say so and provide general helpful information.`;

    return await talk(text, 1200);
  }

  pdf.addEventListener("click", function() {
    save();
  });

  function save() {
    if (!saved) return;
    
    let text = "========================================\n";
    text += saved.title + "\n";
    text += "========================================\n\n";
    text += "Source: " + saved.url + "\n";
    text += "Type: " + (saved.type === 'video' ? 'YouTube Video' : 'Web Page') + "\n\n";
    text += "----------------------------------------\n";
    text += "SUMMARY\n";
    text += "----------------------------------------\n\n";
    text += saved.content + "\n\n";
    text += "========================================\n";
    text += "Generated by Read It Like I'm 5\n";
    text += "Date: " + new Date().toLocaleString() + "\n";
    
    const file = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const link = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = link;
    a.download = saved.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50) + "_summary.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(link);
    
    pdf.textContent = "✓ Downloaded!";
    setTimeout(function() {
      pdf.textContent = "Summary PDF";
    }, 2000);
  }

  async function process(content) {
    const guides = {
      finance: "You are a friendly financial advisor who makes complex money topics easy to understand. Explain investments, markets, and financial concepts like you're talking to someone new to finance. Use real-world money examples.",
      tech: "You are a patient technology expert who loves teaching. Explain technical concepts using everyday analogies - compare code to recipes, servers to restaurants, etc. Make tech accessible to everyone.",
      general: "You are a knowledgeable friend who can explain anything clearly. Break down complex topics into simple, easy-to-understand pieces. Use examples from daily life that anyone can relate to.",
      science: "You are an enthusiastic science teacher who makes learning fun. Explain scientific concepts with cool experiments and real-world examples. Make science exciting and accessible.",
      medicine: "You are a caring doctor who explains health topics in simple terms. Avoid complex medical jargon - instead, use plain language to help people understand their health better.",
      legal: "You are a helpful lawyer friend who cuts through legal complexity. Explain laws, rights, and legal concepts in plain English without the confusing legal jargon."
    };

    const text = `${guides[mode]}

PAGE TITLE: ${content.title}

CONTENT:
${content.text}

Create a detailed and comprehensive summary with:

📌 WHAT IS THIS ABOUT?
(4-5 sentences giving a clear overview)

🔑 KEY POINTS:
• Point 1 - explain in detail
• Point 2 - explain in detail
• Point 3 - explain in detail
• Point 4 - explain in detail
• Point 5 - explain in detail

💡 WHY IT MATTERS:
(3-4 sentences explaining the importance)

🎯 IMPORTANT DETAILS:
(Any numbers, dates, names, or specific facts mentioned)

✅ BOTTOM LINE:
(2-3 sentences with the main takeaway)

Use simple, clear language that anyone can understand!`;

    return await talk(text, 2000);
  }

  async function digest(content) {
    const guides = {
      finance: "As a financial expert, focus on money-related aspects, investment tips, and financial lessons from this video.",
      tech: "As a tech expert, focus on the technical concepts, tools, and innovations discussed in this video.",
      general: "Provide a comprehensive, easy-to-understand summary of this video's content.",
      science: "As a science enthusiast, highlight the scientific concepts and discoveries in this video.",
      medicine: "As a medical professional, focus on health-related information and medical concepts in this video.",
      legal: "As a legal expert, focus on any legal implications, rights, or regulations discussed in this video."
    };

    const text = `${guides[mode]}

Summarize this YouTube video in great detail.

VIDEO TITLE: ${content.title}

CHANNEL: ${content.channel || "Unknown"}

VIDEO DESCRIPTION & INFO:
${content.text}

Create a COMPREHENSIVE and DETAILED summary. This should be long and thorough:

🎬 VIDEO OVERVIEW:
(5-6 sentences explaining what this video is about, the main topic, and the creator's approach)

📋 MAIN TOPICS COVERED:
• Topic 1 - Detailed explanation
• Topic 2 - Detailed explanation
• Topic 3 - Detailed explanation
• Topic 4 - Detailed explanation
• Topic 5 - Detailed explanation
• Topic 6 - Detailed explanation (if applicable)

📝 DETAILED BREAKDOWN:
(Provide a thorough breakdown of the video's content, main arguments, examples used, and explanations given - at least 5-7 sentences)

🎯 KEY TAKEAWAYS:
• Takeaway 1
• Takeaway 2
• Takeaway 3
• Takeaway 4
• Takeaway 5

💡 INSIGHTS & LESSONS:
(What can viewers learn from this video? 3-4 sentences)

👤 WHO SHOULD WATCH:
(Target audience and who would benefit most from this video)

⭐ FINAL THOUGHTS:
(Overall summary and value of the video in 2-3 sentences)

Make this summary detailed and informative so someone can understand the video without watching it!`;

    return await talk(text, 3000);
  }

  query.addEventListener("keypress", function(e) {
    if (e.key === "Enter" && query.value.trim()) {
      answer();
    }
  });

  ask.addEventListener("click", async function() {
    if (!query.value.trim()) {
      show("Please enter a question");
      return;
    }
    await answer();
  });

  async function answer() {
    busy();
    hide();
    pdf.classList.add("hidden");
    
    try {
      data = await getContent();
      const q = query.value;
      
      const result = await explain(data, q);
      
      display(result);
      query.value = "";
    } catch (err) {
      show(err.message);
    }
  }

  sum.addEventListener("click", async function() {
    await summarize();
  });

  async function summarize() {
    busy();
    hide();
    
    try {
      data = await getContent();
      
      let summary;
      if (isvid) {
        summary = await digest(data);
      } else {
        summary = await process(data);
      }
      
      saved = {
        title: data.title,
        content: summary,
        type: isvid ? 'video' : 'page',
        url: data.url
      };
      
      display(summary);
      pdf.classList.remove("hidden");
      
    } catch (err) {
      show(err.message);
      pdf.classList.add("hidden");
    }
  }
});