// ==========================================================
//  FLOWJOCKEY DISPLAY — MICROPHONE / LIVE AUDIO VERSION
// ==========================================================

// AUDIO VARIABLES
let fft, mic;

// VISUAL / LOGIC VARIABLES
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

// ==========================================================
//  START BUTTON (Unlocks Audio Context)
// ==========================================================
document.addEventListener("DOMContentLoaded", function () {
  const startButton = document.createElement("button");
  startButton.id = "startButton";
  startButton.textContent = "Begin Display";
  document.body.appendChild(startButton);

  startButton.addEventListener("click", function () {
    startButton.classList.add("hidden"); 

    // REQUIRED by Chrome: resume audio context on user gesture
    if (getAudioContext().state !== "running") {
      getAudioContext().resume();
    }

    // Start microphone input
    mic = new p5.AudioIn();
    mic.start(() => {
      console.log("Microphone started.");
    });

    // Now connect FFT to mic
    fft = new p5.FFT();
    fft.setInput(mic);
  });
});

// ==========================================================
//  NO PRELOAD() ANYMORE — no loadSound()
// ==========================================================


// ==========================================================
//  SETUP
// ==========================================================
function setup() {
  createCanvas(windowWidth, windowHeight);

  // WebSocket setup
  const serverAddress = "wss://flowjockey-server.onrender.com";
  ws = new WebSocket(serverAddress);

  ws.onopen = function () {
    const clientdata = { type: "client_info", app: "display" };
    ws.send(clientdata);
  };

  ws.onmessage = function (event) {
    let reader = new FileReader();
    reader.readAsText(event.data);
    reader.onload = function () {
      let obj = JSON.parse(reader.result);

      // ============================
      // MODE SWITCH
      // ============================
      if (obj.type === "modeswitch") {
        mode = obj.mode;
        console.log(obj.mode);

        partydata = clientdata.map((client) => ({
          shapes: client.shapes.map((shape) => ({
            x: shape.x,
            y: shape.y,
          })),
          clientnum: client.clientnum,
          xdir: (random() - 0.5) / 0.5,
          ydir: (random() - 0.5) / 0.5,
        }));
      }

      // ============================
      // PLAY/PAUSE BUTTON FROM DRAW CLIENT (IGNORED NOW)
      // ============================
      if (obj.type === "playpause") {
        if (obj.val === "pressed") {
          console.log(obj.val);

          // Instead of playing music, ensure audio context is running
          if (getAudioContext().state !== "running") {
            getAudioContext().resume();
          }
        }
      }

      // ============================
      // EQ SLIDER VALUES
      // ============================
      if (obj.type === "bassval") bass = obj.val;
      if (obj.type === "midval") mid = obj.val;
      if (obj.type === "trebleval") treble = obj.val;

      movescale =
        (0.04 * bass) / 100 + (0.04 * mid) / 100 + (0.04 * treble) / 100;

      // ============================
      // NEW CLIENT JOINED
      // ============================
      if (obj.type === "client_info" && obj.app === "draw") {
        numclients += 1;

        if (numclients > 25) overflow += 1;
        if (numcols < maxcols) numcols += 1;
        if ((numclients - 1) % 5 == 0 && numrows < maxrows) numrows += 1;

        const clientnum = { type: "clientnum", number: numclients };
        ws.send(JSON.stringify(clientnum));
        console.log(numclients);
      }

      // ============================
      // NEW SHAPE
      // ============================
      if (obj.type === "newshape") {
        let xdir = (random() - 0.5) / 0.5;
        let ydir = (random() - 0.5) / 0.5;

        clientdata.push({
          shapes: obj.points,
          clientnum: obj.clientnum,
          xdir: xdir,
          ydir: ydir,
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
  };
}

// ==========================================================
//  DRAW LOOP
// ==========================================================
function draw() {
  background(0);

  if (!fft) return; // prevent errors if audio hasn't started yet

  let spectrum = fft.analyze();
  let waveform = fft.waveform();
  let lowEnergy = fft.getEnergy("bass");
  let midEnergy = fft.getEnergy("mid");
  let highEnergy = fft.getEnergy("treble");

  let sizeFactor = map(lowEnergy, 0, 255, 0.9, 2.2 * bass / 100);
  let noiseFactor1 = map(midEnergy, 0, 765, 5, 60 * mid / 100);
  let noiseFactor2 = map(highEnergy, 0, 765, 5, 120 * mid / 100);

  stroke(255);
  fill(0, 0, 0, 0);
  strokeWeight(1);

  // ========= GRID MODE =========
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

        let offsetX = noise(pt.x, pt.y, frameCount * 0.1) * wave1;
        let offsetY = noise(pt.y, pt.x, frameCount * 0.1) * wave2;
        curveVertex(scaledX + offsetX, scaledY + offsetY);
      }

      endShape();
    }
  }

  // ========= PARTY MODE =========
  if (mode === "party") {
    let moveScale = map(lowEnergy, 0, 255, 0.01, movescale);

    for (let party of partydata) {
      beginShape();

      const colval = (party.clientnum - overflow - 1) % maxcols;
      const rowval = Math.floor((party.clientnum - overflow - 1) / maxrows);

      for (let pt of party.shapes) {
        if (lowEnergy > 225) {
          pt.x += party.xdir * moveScale;
          pt.y += party.ydir * moveScale;
        }

        if (pt.x <= 0 || pt.x >= 1) party.xdir *= -1;
        if (pt.y <= 0 || pt.y >= 1) party.ydir *= -1;

        let finalX =
          pt.x * (windowWidth / numcols) + colval * (windowWidth / numcols);
        let finalY =
          pt.y * (windowHeight / numrows) + rowval * (windowHeight / numrows);

        curveVertex(finalX, finalY);
      }

      endShape();
    }
  }

  // ========= COLOR MODE =========
  if (mode === "color") {
    let bassScale = map((lowEnergy * bass) / 100, 0, 255, 0.01, 0.04);
    let midScale = map((midEnergy * mid) / 100, 0, 255, 0.01, 0.04);
    let trebleScale = map((highEnergy * treble) / 100, 0, 255, 0.01, 0.04);

    for (let party of partydata) {
      const colval = (party.clientnum - overflow - 1) % maxcols;
      const rowval = Math.floor((party.clientnum - overflow - 1) / maxrows);

      if (lowEnergy > (55 * bass) / 100 + 200) {
        fill(color(random(255), random(255), random(255)));
        rect(
          (colval * windowWidth) / numcols,
          (rowval * windowHeight) / numrows,
          windowWidth / numcols,
          windowHeight / numrows
        );
      }

      beginShape();
      for (let pt of party.shapes) {
        if (lowEnergy > 200) {
          pt.x += party.xdir * bassScale;
          pt.y += party.ydir * bassScale;
        }
        if (midEnergy > 200) {
          pt.x += party.xdir * midScale;
          pt.y += party.ydir * midScale;
        }
        if (highEnergy > 200) {
          pt.x += party.xdir * trebleScale;
          pt.y += party.ydir * trebleScale;
        }

        if (pt.x <= 0 || pt.x >= 1) party.xdir *= -1;
        if (pt.y <= 0 || pt.y >= 1) party.ydir *= -1;

        let finalX =
          pt.x * (windowWidth / numcols) + colval * (windowWidth / numcols);
        let finalY =
          pt.y * (windowHeight / numrows) + rowval * (windowHeight / numrows);

        curveVertex(finalX, finalY);
      }
      endShape();
    }
  }
}

// ==========================================================
// RESIZE
// ==========================================================
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
