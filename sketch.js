// Example adapted from https://p5js.org/reference/#/p5.FFT

let sound, fft, waveform, spectrum, audioContext;
let mic;
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
let audio = "pre-loaded";

// Add the button for "Begin Display"
document.addEventListener("DOMContentLoaded", function () {
  const startButton = document.createElement("button");
  startButton.id = "startButton";
  startButton.textContent = "Begin Display";
  document.body.appendChild(startButton);

  startButton.addEventListener("click", function () {
    startButton.classList.add("hidden");

    // ------------------------------------------------------------
    // *** NEW: Start microphone due to Chrome user gesture rule ***
    // ------------------------------------------------------------
    userStartAudio();

    if (audio === "mic") {
      mic = new p5.AudioIn();
      mic.start(() => {
        console.log("✔ Mic started");
        fft = new p5.FFT(0.4, 1024);
        fft.setInput(mic);
        micStarted = true;
      });
    } else {
      console.log("✔ Playing 757 track");
      sound.loop();
      fft = new p5.FFT(0.4, 1024);
      fft.setInput(sound);
      micStarted = true;
    }
  });
});

function preload() {
  sound = loadSound(
    "https://cdn.glitch.me/a32338f3-5980-41ad-b4b3-76e5515233d6/02%20-%20757%20%5BExplicit%5D.wav?v=1714651726001"
  );
}

function setup() {
  let cnv = createCanvas(windowWidth, windowHeight);
  fft = new p5.FFT();

  //websocket setup
  const serverAddress = "wss://flowjockey-server.onrender.com";
  ws = new WebSocket(serverAddress);
  ws.onopen = function () {
    const msg = { type: "client_info", app: "display" };
    ws.send(JSON.stringify(msg));

  };

  ws.onmessage = async function (event) {
    let text;

    // Blob handling (other devices)
    if (event.data instanceof Blob) {
        text = await event.data.text();
    } else {
        // widget-to-widget messages on same page come as plain strings
        text = event.data;
    }

    const obj = JSON.parse(text);
      if (obj.type === "modeswitch") {
        mode = obj.mode;
        console.log(obj.mode);
        // Copy and reset positions for party mode
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
      if(obj.type === "audioswitch"){
        audio = obj.val;

        if(micStarted){
          if(audio==="mic"){
            if (sound && sound.isPlaying()) {
              sound.stop();
            }
            mic = new p5.AudioIn();
            mic.start(() => {
              fft.setInput(mic);
            });
          }else{
            if(mic){
              mic.stop();
            }
            sound.loop();
            fft.setInput(sound);
          }
        }
      }
      if (obj.type === "playpause") {
        if(obj.val==='pressed'){
          console.log(obj.val);
          togglePlay();
        }
      }
      if (obj.type === "bassval") {
        bass = obj.val;
      }
      if (obj.type === "midval") {
        mid = obj.val;
      }
      if (obj.type === "trebleval") {
        treble = obj.val;
      }
      if (obj.type === "lowthreshval") {
        lowthresh = obj.val;
      }
      if (obj.type === "midthreshval") {
        midthresh = obj.val;
      }
      if (obj.type === "highthreshval") {
        highthresh = obj.val;
      }
      movescale =
        (0.04 * bass)/100+ (0.04 * mid)/100 + (0.04 * treble)/100;
      if (obj.type === "client_info" && obj.app === "draw") {
        numclients += 1;
        if (numclients > 25) {
          overflow += 1;
        }

        if (numcols < maxcols) {
          numcols += 1;
        }
        if ((numclients - 1) % 5 == 0 && numrows < maxrows) {
          numrows += 1;
        }

        const clientnum = { type: "clientnum", number: numclients };
        ws.send(JSON.stringify(clientnum));
        console.log(numclients);
      }
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


function draw() {
  background(0);
  if (!micStarted) return;
  let spectrum = fft.analyze();
  let waveform = fft.waveform();
  let lowEnergy = fft.getEnergy("bass");
  let midEnergy = fft.getEnergy("mid");
  let highEnergy = fft.getEnergy("treble");

  let sizeFactor = map(fft.getEnergy("bass"), 0, 255, 0.9, 2.2*bass/100); // Example: scale size based on bass energy
  let noiseFactor1 = map(midEnergy, 0, 765, 5, 60*mid/100);
  let noiseFactor2 = map(highEnergy, 0, 765, 5, 120*mid/100);
  stroke(255);
  fill(0, 0, 0, 0);
  strokeWeight(1);
  if (mode === "grid") {
    for (let client of clientdata) {
      beginShape();
      const colval = (client.clientnum - overflow - 1) % maxcols;
      const rowval = Math.floor((client.clientnum - overflow - 1) / maxrows);
      //console.log(client.clientnum)
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
    let moveScale = map(lowEnergy, 0, 255, 0.01, movescale); // Dynamic movement scale based on bass energy
    for (let party of partydata) {
      beginShape();
      const colval = (party.clientnum - overflow - 1) % maxcols;
      const rowval = Math.floor((party.clientnum - overflow - 1) / maxrows);

      for (let pt of party.shapes) {
        // Apply scaled movement
        if (lowEnergy > lowthresh) {
          pt.x += party.xdir * moveScale;
          pt.y += party.ydir * moveScale;
        }

        // Boundary checks
        if (pt.x <= 0 || pt.x >= 1) party.xdir = -party.xdir;
        if (pt.y <= 0 || pt.y >= 1) party.ydir = -party.ydir;

        let finalX =
          pt.x * (windowWidth / numcols) + colval * (windowWidth / numcols);
        let finalY =
          pt.y * (windowHeight / numrows) + rowval * (windowHeight / numrows);

        curveVertex(finalX, finalY);
      }
      endShape();
    }
  }
  if (mode === "color") {
    let bassScale = map((lowEnergy * bass) / 100, 0, 255, 0.01, 0.04);
    let midScale = map((midEnergy * mid) / 100, 0, 255, 0.01, 0.04);
    let trebleScale = map((highEnergy * treble) / 100, 0, 255, 0.01, 0.04); // Dynamic movement scale based on bass energy
    for (let party of partydata) {
      const colval = (party.clientnum - overflow - 1) % maxcols;
      const rowval = Math.floor((party.clientnum - overflow - 1) / maxrows);
      if (lowEnergy > lowthresh) {
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
      if (midEnergy > midthresh) {
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
      if (highEnergy > highthresh) {
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
        // Apply scaled movement
        if (lowEnergy > lowthresh) {
          pt.x += party.xdir * bassScale;
          pt.y += party.ydir * bassScale;
        }
        if (lowEnergy > midthresh) {
          pt.x += party.xdir * midScale;
          pt.y += party.ydir * midScale;
        }
        if (lowEnergy > highthresh) {
          pt.x += party.xdir * trebleScale;
          pt.y += party.ydir * trebleScale;
        }

        // Boundary checks
        if (pt.x <= 0 || pt.x >= 1) party.xdir = -party.xdir;
        if (pt.y <= 0 || pt.y >= 1) party.ydir = -party.ydir;

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


function togglePlay(){
  if (audio==="pre-loaded"){
    if (sound.isPlaying()) {
      sound.pause();
    } else {
      sound.loop();
    }
  }
}
/*function togglePlay() {
  if (sound.isPlaying()) {
    sound.pause();
  } else {
    sound.loop();
  }
}*/

/*
function keyPressed() {
  if (key === "1") {
    if (mode === "grid" || mode === "color") {
      mode = "party";
      // Copy and reset positions for party mode
      partydata = clientdata.map((client) => ({
        shapes: client.shapes.map((shape) => ({
          x: shape.x,
          y: shape.y,
        })),
        clientnum: client.clientnum,
        xdir: (random() - 0.5) / 0.5,
        ydir: (random() - 0.5) / 0.5,
      }));
    } else {
      mode = "grid";
    }
    console.log("Mode switched to:", mode);
  }
  if (key === "2") {
    if (mode === "grid" || mode === "party") {
      mode = "color";
      // Copy and reset positions for party mode
      partydata = clientdata.map((client) => ({
        shapes: client.shapes.map((shape) => ({
          x: shape.x,
          y: shape.y,
        })),
        clientnum: client.clientnum,
        xdir: (random() - 0.5) / 0.5,
        ydir: (random() - 0.5) / 0.5,
      }));
    } else {
      mode = "grid";
    }
    console.log("Mode switched to:", mode);
  }
}
*/

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
