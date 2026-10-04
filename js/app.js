const events = [
  {
    name: "Duck Race",
    date: "18 October 2026",
    progress: 76
  },
  {
    name: "Sports Day",
    date: "12 June 2027",
    progress: 42
  },
  {
    name: "Christmas Light Switch-On",
    date: "5 December 2026",
    progress: 61
  }
];

const eventsGrid = document.getElementById("eventsGrid");

function renderEvents() {
  eventsGrid.innerHTML = events.map(event => `
    <article class="event-card">
      <h3>${event.name}</h3>
      <p class="event-date">${event.date}</p>

      <div class="progress-row">
        <span>Event readiness</span>
        <span>${event.progress}%</span>
      </div>

      <div class="progress-track" aria-label="${event.progress}% complete">
        <div class="progress-bar" style="width: ${event.progress}%"></div>
      </div>

      <div class="event-footer">
        <span class="ready">${event.progress >= 75 ? "ON TRACK" : "ACTION REQUIRED"}</span>
        <button class="view-button" onclick="viewEvent('${event.name}')">Open Event</button>
      </div>
    </article>
  `).join("");
}

function viewEvent(name) {
  alert(`${name} dashboard will be built next.`);
}

document.getElementById("addEventButton").addEventListener("click", () => {
  alert("Add Event functionality will be built next.");
});

renderEvents();
