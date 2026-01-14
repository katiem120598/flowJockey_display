// DISPLAY (p5.js + websockets)

let sound, fft, mic;
let micStarted = false;

let numrows = 0;
let numcols = 0;
let numclients = 0;
let mode = "grid";
let clientdata = [];
let partydata = [];
let maxrows = 5;
let maxcols = 5;
let overflow = 0;

let movescale = 0.02;
let bass = 50;
let mid = 50;
let treble = 50;
let lowthresh = 5;
let midthresh = 5;
let highthresh = 5;

// audio state
let audio = "pre-loaded";     // "pre-loaded" or "mic" (matches your perform app)
let startedByUser = false;    // user clicked Begin Display
let soundReady = false;       // wav finished loading

let ws;

// --- UI: Begin Display button (required) ---
document.addEventListener("DOMContentLoaded", () => {
  const startButton = document.createElement("button");
  startButton.id = "startButton";
  startButton.textContent = "Begin Display";
  document.body.appendChild(startButton);

  startButton.addEventListener("click", () => {
    startButton.classList.add("hidden");

    // MUST happen on user gesture for Chrome/Safari
    userStartAudio();
    startedByUser = true;

    // whichever audio mode we're currently in, start it
    if (audio === "mic") {
      startMic();
    } else {
      startSoundIfReady(); // will play immediately if loaded; otherwise will play when it finishes loading
    }
  });
});

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(0);

  fft = new p5.FFT(0.4, 1024);

  // Load the sound (doesn't autoplay)
  sound = loadSound(
    "https://cdn.glitch.me/a32338f3-5980-41ad-b4b3-76e5515233d6/02%20-%20757%20%5BExplicit%5D.wav?v=1714651726001",
    () => {
      console.log("✔ Sound loaded");
      soundReady = true;

      // If user already clicked and we're in pre-loaded mode, start now
      if (startedByUser && audio === "pre-loaded") startSoundIfReady();
    },
    (err) => {
      console.warn("Sound failed to load, falling back to mic:", err);
      audio = "mic";
      if (startedByUser) startMic();
    }
  );

  // websocket setup
  const serverAddress = "wss://flowjockey-server.onrender.com";
  ws = new WebSocket(serverAddress);

  ws.onopen = () => {
    const msg = { type: "client_info", app: "display" };
    ws.send(JSON.stringify(msg));
  };

  ws.onmessage = async (event) => {
    let text;
    if (event.data instanceof Blob) text = await event.data.text();
    else text = event.data;

    const obj = JSON.parse(text);

    if (obj.type === "modeswitch") {
      mode = obj.mode;
      console.log("mode:", mode);

      // refresh partydata positions
      partydata = clientdata.map((client) => ({
        shapes: client.shapes.map((shape) => ({ x: shape.x, y: shape.y })),
        clientnum: client.clientnum,
        xdir: (random() - 0.5) / 0.5,
        ydir: (random() - 0.5) / 0.5,
      }));
    }

    if (obj.type === "audioswitch") {
      audio = obj.val; // "pre-loaded" or "mic"
      console.log("audio:", audio);

      if (!startedByUser) {
        // can't start anything until Begin Display click
        return;
      }

      if (audio === "mic") {
        // stop sound, start mic
        if (sound && sound.isPlaying()) sound.stop();
        startMic();
      } else {
        // stop mic, start sound
        stopMic();
        startSoundIfReady();
      }
    }

    if (obj.type === "playpause" && obj.val === "pressed") {
      togglePlay();
    }

    if (obj.type === "bassval") bass = obj.val;
    if (obj.type === "midval") mid = obj.val;
    if (obj.type === "trebleval") treble = obj.val;
    if (obj.type === "lowthreshval") lowthresh = obj.val;
    if (obj.type === "midthreshval") midthresh = obj.val;
    if (obj.type === "highthreshval") highthresh = obj.val;

    movescale = (0.04 * bass) / 100 + (0.04 * mid) / 100 + (0.04 * treble) / 100;

    if (obj.type === "client_info" && obj.app === "draw") {
      numclients += 1;
      if (numclients > 25) overflow += 1;

      if (numcols < maxcols) numcols += 1;
      if ((numclients - 1) % 5 === 0 && numrows < maxrows) numrows += 1;

      const clientnumMsg = { type: "clientnum", number: numclients };
      ws.send(JSON.stringify(clientnumMsg));
      console.log("numclients:", numclients);
    }

    if (obj.type === "newshape") {
      clientdata.push({
        shapes: obj.points,
        clientnum: obj.clientnum,
        xdir: (random() - 0.5) / 0.5,
        ydir: (random() - 0.5) / 0.5,
        col: color(random(255), random(255), random(255)),
      });

      partydata = clientdata.map((client) => ({
        shapes: client.shapes.map((shape) => ({
          x: shape.x,
          y: shape.y,
          col: shape.col,
        })),
        clientnum: client.clientnum,
        xdir: (random() - 0.5) / 0.5,
        ydir: (random() - 0.5) / 0.5,
      }));
    }
  };
}

function startSoundIfReady() {
  if (!soundReady) {
    console.log("…waiting for sound to finish loading");
    return;
  }

  // ensure input is set before playing
  fft.setInput(sound);

  if (!sound.isPlaying()) sound.loop();
  micStarted = true;
  console.log("✔ sound playing");
}

function startMic() {
  if (!mic) mic = new p5.AudioIn();

  mic.start(
    () => {
      console.log("✔ mic started");
      fft.setInput(mic);
      micStarted = true;
    },
    (err) => {
      console.warn("Mic failed to start:", err);
    }
  );
}

function stopMic() {
  if (mic) {
    try {
      mic.stop();
    } catch (e) {}
  }
}

function togglePlay() {
  // only meaningful in pre-loaded mode
  if (audio !== "pre-loaded") return;
  if (!soundReady) return;

  if (sound.isPlaying()) sound.pause();
  else sound.loop();
}

function draw() {
  background(0);
  if (!micStarted) return;

  let spectrum = fft.analyze();
  let waveform = fft.waveform();
  let lowEnergy = fft.getEnergy("bass");
  let midEnergy = fft.getEnergy("mid");
  let highEnergy = fft.getEnergy("treble");

  let sizeFactor = map(lowEnergy, 0, 255, 0.9, 2.2 * (bass / 100));
  let noiseFactor1 = map(midEnergy, 0, 765, 5, 60 * (mid / 100));
  let noiseFactor2 = map(highEnergy, 0, 765, 5, 120 * (mid / 100));

  stroke(255);
  fill(0, 0, 0, 0);
  strokeWeight(1);

  if (mode === "grid") {
    for (let client of clientdata) {
      beginShape();
      const colval = (client.clientnum - overflow - 1) % maxcols;
      const rowval = Math.floor((client.clientnum - overflow - 1) / maxrows);

      for (let pt of client.shapes) {
        let angle1 = frameCount * 0.02 + pt.x * 0.1;
        let angle2 = frameCount * 0.03 + pt.x * 0.05;
        let wave1 = noiseFactor1 * sin(angle1);
        let wave2 = noiseFactor2 * sin(angle2);

        let scaledX =
          pt.x * sizeFactor * (windowWidth / numcols) +
          (colval * windowWidth) / numcols;
        let scaledY =
          pt.y * sizeFactor * (windowHeight / numrows) +
          (rowval * windowHeight) / numrows;

        if (colval % 2 === 0 && rowval % 3 === 0) {
          let offsetX = noise(pt.x, pt.y, frameCount * 0.1) * wave1;
          let offsetY = noise(pt.y, pt.x, frameCount * 0.1);
          curveVertex(
            offsetX +
              pt.x * (windowWidth / numcols) +
              (colval * windowWidth) / numcols,
            offsetY + scaledY
          );
        } else if (colval % 2 === 1 && rowval % 3 === 0) {
          let offsetX = noise(pt.x, pt.y, frameCount * 0.1) * noiseFactor2;
          let offsetY = noise(pt.y, pt.x, frameCount * 0.1) * noiseFactor2;
          curveVertex(
            offsetX +
              pt.x * (windowWidth / numcols) +
              (colval * windowWidth) / numcols,
            offsetY +
              pt.y * (windowHeight / numrows) +
              (rowval * windowHeight) / numrows
          );
        } else if (colval % 2 === 1 && rowval % 3 === 1) {
          let offsetX = noise(pt.x, pt.y, frameCount * 0.1);
          let offsetY = noise(pt.y, pt.x, frameCount * 0.1);
          curveVertex(
            offsetX +
              pt.x * (windowWidth / numcols) +
              (colval * windowWidth) / numcols,
            offsetY + scaledY
          );
        } else if (colval % 2 === 1 && rowval % 3 === 2) {
          let offsetX = noise(pt.x, pt.y, frameCount * 0.1) * noiseFactor2;
          let offsetY = noise(pt.y, pt.x, frameCount * 0.1) * noiseFactor2;
          curveVertex(
            offsetX +
              pt.x * (windowWidth / numcols) +
              (colval * windowWidth) / numcols,
            offsetY +
              pt.y * (windowHeight / numrows) +
              (rowval * windowHeight) / numrows
          );
        } else if (colval % 2 === 0 && rowval % 3 === 2) {
          let offsetX = noise(pt.x, pt.y, frameCount * 0.1) * noiseFactor1;
          let offsetY = noise(pt.y, pt.x, frameCount * 0.1) * noiseFactor1;
          curveVertex(
            offsetX +
              pt.x * (windowWidth / numcols) +
              (colval * windowWidth) / numcols,
            offsetY + scaledY
          );
        } else {
          let offsetX = noise(pt.x, pt.y, frameCount * 0.1) * noiseFactor1;
          let offsetY = noise(pt.y, pt.x, frameCount * 0.1) * noiseFactor1;
          curveVertex(
            scaledX,
            offsetY +
              pt.y * (windowHeight / numrows) +
              (rowval * windowHeight) / numrows
          );
        }
      }
      endShape();
    }
  }

  if (mode === "party") {
    let moveScale = map(lowEnergy, 0, 255, 0.01, movescale);
    for (let party of partydata) {
      beginShape();
      const colval = (party.clientnum - overflow - 1) % maxcols;
      const rowval = Math.floor((party.clientnum - overflow - 1) / maxrows);

      for (let pt of party.shapes) {
        if (lowEnergy > lowthresh) {
          pt.x += party.xdir * moveScale;
          pt.y += party.ydir * moveScale;
        }

        if (pt.x <= 0 || pt.x >= 1) party.xdir = -party.xdir;
        if (pt.y <= 0 || pt.y >= 1) party.ydir = -party.ydir;

        let finalX = pt.x * (windowWidth / numcols) + colval * (windowWidth / numcols);
        let finalY = pt.y * (windowHeight / numrows) + rowval * (windowHeight / numrows);

        curveVertex(finalX, finalY);
      }
      endShape();
    }
  }

  if (mode === "color") {
    let bassScale = map((lowEnergy * bass) / 100, 0, 255, 0.01, 0.04);
    let midScale = map((midEnergy * mid) / 100, 0, 255, 0.01, 0.04);
    let trebleScale = map((highEnergy * treble) / 100, 0, 255, 0.01, 0.04);

    for (let party of partydata) {
      const colval = (party.clientnum - overflow - 1) % maxcols;
      const rowval = Math.floor((party.clientnum - overflow - 1) / maxrows);

      if (lowEnergy > lowthresh || midEnergy > midthresh || highEnergy > highthresh) {
        push();
        fill(color(random(255), random(255), random(255)));
        rect(
          (colval * windowWidth) / numcols,
          (rowval * windowHeight) / numrows,
          windowWidth / numcols,
          windowHeight / numrows
        );
        pop();
      }

      beginShape();
      for (let pt of party.shapes) {
        if (lowEnergy > lowthresh) {
          pt.x += party.xdir * bassScale;
          pt.y += party.ydir * bassScale;
        }
        if (midEnergy > midthresh) {
          pt.x += party.xdir * midScale;
          pt.y += party.ydir * midScale;
        }
        if (highEnergy > highthresh) {
          pt.x += party.xdir * trebleScale;
          pt.y += party.ydir * trebleScale;
        }

        if (pt.x <= 0 || pt.x >= 1) party.xdir = -party.xdir;
        if (pt.y <= 0 || pt.y >= 1) party.ydir = -party.ydir;

        let finalX = pt.x * (windowWidth / numcols) + colval * (windowWidth / numcols);
        let finalY = pt.y * (windowHeight / numrows) + rowval * (windowHeight / numrows);

        curveVertex(finalX, finalY);
      }
      endShape();
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
