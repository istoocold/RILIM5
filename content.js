const { useContext } = require("react");

function pull(head, link) {
  let vid = "";
  if (link.includes("youtube.com/watch?v=")) {
    vid = link.split("v=")[1].split("&")[0];
  } else if (link.includes("youtu.be/")) {
    vid = link.split("youtu.be/")[1].split("?")[0];
  }
  
  let info = "";
  const boxes = [
    "#description-inline-expander yt-formatted-string",
    "#description-inline-expander",
    "#description yt-formatted-string", 
    "#description",
    "#structured-description",
    'meta[name="description"]'
  ];
  
  for (const box of boxes) {
    const el = document.querySelector(box);
    if (el) {
      info = el.textContent || el.getAttribute("content") || "";
      if (info.length > 50) break;
    }
  }
  
  let author = "";
  const names = [
    "#channel-name a",
    "ytd-channel-name a",
    "#owner-name a",
    "#channel-name yt-formatted-string",
    "ytd-video-owner-renderer #channel-name"
  ];
  
  for (const name of names) {
    const el = document.querySelector(name);
    if (el) {
      author = el.textContent.trim();
      if (author) break;
    }
  }

  let time = "";
  const timer = document.querySelector(".ytp-time-duration");
  if (timer) {
    time = timer.textContent;
  }

  let count = "";
  const views = document.querySelector("#info-strings yt-formatted-string") ||
                document.querySelector(".view-count");
  if (views) {
    count = views.textContent;
  }

  let talk = "";
  const chat = document.querySelectorAll("#content-text");
  if (chat.length > 0) {
    talk = Array.from(chat)
      .slice(0, 5)
      .map(el => el.textContent.trim())
      .join(" | ");
  }

  let all = "";
  if (author) all += "Channel: " + author + "\n";
  if (time) all += "Duration: " + time + "\n";
  if (count) all += "Views: " + count + "\n";
  all += "\nDescription:\n" + info;
  if (talk) all += "\n\nTop Comments:\n" + talk;
  
  return {
    title: head.replace(" - YouTube", ""),
    text: all,
    url: link,
    videoId: vid,
    channel: author,
    duration: time,
    type: 'video'
  };
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "getContent") {
    const stuff = grab();
    sendResponse(stuff);
  }
  return true;
});

function grab() {
  const head = document.title;
  const link = window.location.href;
  
  if (link.includes("youtube.com/watch") || link.includes("youtu.be/")) {
    return pull(head, link);
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