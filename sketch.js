let fft, waveform, spectrum, audioContext;
let mic;  

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

// Add the button for "Begin Display"
document.addEventListener("DOMContentLoaded", function () {
  const startButton = document.createElement("button");
  startButton.id = "startButton";
  startButton.textContent = "Begin Display";
  document.body.appendChild(startButton);

  startButton.addEventListener("click", function () {
    startButton.classList.add("hidden");

    // REQUIRED for audio on browsers
    userStartAudio();

    // Start microphone
    mic.start(() => {
      console.log("Mic started ✔");
      fft.setInput(mic);
    });
  });
});

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Create mic + fft
  mic = new p5.AudioIn();
  fft = new p5.FFT();

  // WebSocket setup
  const serverAddress = "wss://flowjockey-server.onrender.com";  // ← your new server URL
  ws = new WebSocket(serverAddress);

  ws.onopen = function () {
    const msg = { type: "client_info", app: "display" };
    ws.send(JSON.stringify(msg));
  };

  ws.onmessage = function (event) {
    let reader = new FileReader();
    reader.readAsText(event.data);

    reader.onload = function () {
      let obj;
      try {
        obj = JSON.parse(reader.result);
      } catch (e) {
        console.log("Invalid message:", reader.result);
        return;
      }

      // --- Incoming messages ---
      if (obj.type === "modeswitch") {
        mode = obj.mode;
        console.log("Mode:", mode);

        // Reset partydata after switch
        partydata = clientdata.map((client) => ({
          shapes: client.shapes.map((s) => ({ x: s.x, y: s.y })),
          clientnum: client.clientnum,
          xdir: (random() - 0.5) * 2,
          ydir: (random() - 0.5) * 2
        }));
      }

      if (obj.type === "bassval") bass = obj.val;
      if (obj.type === "midval") mid = obj.val;
      if (obj.type === "trebleval") treble = obj.val;

      movescale =
        (0.04 * bass) / 100 + (0.04 * mid) / 100 + (0.04 * treble) / 100;

      if (obj.type === "client_info" && obj.app === "draw") {
        numclients += 1;
        if (numclients > 25) overflow += 1;

        if (numcols < maxcols) numcols += 1;
        if ((numclients - 1) % 5 == 0 && numrows < maxrows) numrows += 1;

        const reply = { type: "clientnum", number: numclients };
        ws.send(JSON.stringify(reply));
      }

      if (obj.type === "newshape") {
        clientdata.push({
          shapes: obj.points,
          clientnum: obj.clientnum,
          xdir: (random() - 0.5) * 2,
          ydir: (random() - 0.5) * 2,
          col: color(random(255), random(255), random(255))
        });

        partydata = clientdata.map((client) => ({
          shapes: client.shapes.map((p) => ({ x: p.x, y: p.y })),
          clientnum: client.clientnum,
          xdir: (random() - 0.5) * 2,
          ydir: (random() - 0.5) * 2
        }));
      }
    };
  };
}

function draw() {
  background(0);

  let spectrum = fft.analyze();
  let waveform = fft.waveform();
  let lowEnergy = fft.getEnergy("bass");
  let midEnergy = fft.getEnergy("mid");
  let highEnergy = fft.getEnergy("treble");

  let sizeFactor = map(lowEnergy, 0, 255, 0.9, 2.2 * bass / 100);
  let noiseFactor1 = map(midEnergy, 0, 765, 5, 60 * mid / 100);
  let noiseFactor2 = map(highEnergy, 0, 765, 5, 120 * treble / 100);

  stroke(255);
  noFill();
  strokeWeight(1);

  if (mode === "grid") {
    drawGridMode(lowEnergy, midEnergy, highEnergy, sizeFactor, noiseFactor1, noiseFactor2);
  }

  if (mode === "party") {
    drawPartyMode(lowEnergy);
  }

  if (mode === "color") {
    drawColorMode(lowEnergy, midEnergy, highEnergy);
  }
}

function drawGridMode(lowEnergy, midEnergy, highEnergy, sizeFactor, noiseFactor1, noiseFactor2) {
  for (let client of clientdata) {
    beginShape();
    const colval = (client.clientnum - overflow - 1) % maxcols;
    const rowval = Math.floor((client.clientnum - overflow - 1) / maxrows);

    for (let pt of client.shapes) {
      let angle1 = frameCount * 0.02 + pt.x * 0.1;
      let angle2 = frameCount * 0.03 + pt.x * 0.05;
      let wave1 = noiseFactor1 * sin(angle1);
      let wave2 = noiseFactor2 * sin(angle2);

      let scaledX = pt.x * sizeFactor * (windowWidth / numcols) + (colval * windowWidth) / numcols;
      let scaledY = pt.y * sizeFactor * (windowHeight / numrows) + (rowval * windowHeight) / numrows;

      let offset = noise(pt.x, pt.y, frameCount * 0.1);

      curveVertex(
        scaledX + offset * wave1,
        scaledY + offset * wave2
      );
    }
    endShape();
  }
}

function drawPartyMode(lowEnergy) {
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

      let finalX = pt.x * (windowWidth / numcols) + colval * (windowWidth / numcols);
      let finalY = pt.y * (windowHeight / numrows) + rowval * (windowHeight / numrows);

      curveVertex(finalX, finalY);
    }
    endShape();
  }
}

function drawColorMode(lowEnergy, midEnergy, highEnergy) {
  let bassScale = map(lowEnergy * bass / 100, 0, 255, 0.01, 0.04);
  let midScale = map(midEnergy * mid / 100, 0, 255, 0.01, 0.04);
  let trebleScale = map(highEnergy * treble / 100, 0, 255, 0.01, 0.04);

  for (let party of partydata) {
    const colval = (party.clientnum - overflow - 1) % maxcols;
    const rowval = Math.floor((party.clientnum - overflow - 1) / maxrows);

    if (lowEnergy > (55 * bass) / 100 + 200) {
      fill(color(random(255), random(255), random(255)));
      rect((colval * windowWidth) / numcols, (rowval * windowHeight) / numrows, windowWidth / numcols, windowHeight / numrows);
      noFill();
    }

    beginShape();
    for (let pt of party.shapes) {
      if (lowEnergy > 200) {
        pt.x += party.xdir * bassScale;
        pt.y += party.ydir * bassScale;
        pt.x += party.xdir * midScale;
        pt.y += party.ydir * midScale;
        pt.x += party.xdir * trebleScale;
        pt.y += party.ydir * trebleScale;
      }

      if (pt.x <= 0 || pt.x >= 1) party.xdir *= -1;
      if (pt.y <= 0 || pt.y >= 1) party.ydir *= -1;

      let finalX = pt.x * (windowWidth / numcols) + colval * (windowWidth / numcols);
      let finalY = pt.y * (windowHeight / numrows) + rowval * (windowHeight / numrows);

      curveVertex(finalX, finalY);
    }
    endShape();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
