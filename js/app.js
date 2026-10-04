const categories = [
  "Paperwork",
  "Equipment",
  "People",
  "Payments",
  "Venue",
  "Promotion",
  "Logistics",
  "Other"
];

const STORAGE_KEY = "duckClubEventDashData";

const defaultEvents = [
  {
    id: crypto.randomUUID(),
    name: "Duck Race",
    date: "2026-10-18",
    tasks: [
      { id: crypto.randomUUID(), category: "Paperwork", name: "Risk assessment", assignedTo: "Darren", dueDate: "2026-10-10", priority: "High", notes: "", complete: true },
      { id: crypto.randomUUID(), category: "Paperwork", name: "Council permission", assignedTo: "John", dueDate: "2026-10-12", priority: "High", notes: "", complete: false },
      { id: crypto.randomUUID(), category: "Equipment", name: "Gazebos", assignedTo: "Dave", dueDate: "2026-10-16", priority: "Medium", notes: "", complete: true },
      { id: crypto.randomUUID(), category: "Equipment", name: "PA system", assignedTo: "Dave", dueDate: "2026-10-17", priority: "High", notes: "", complete: false },
      { id: crypto.randomUUID(), category: "People", name: "Marshal team", assignedTo: "Sarah", dueDate: "2026-10-14", priority: "High", notes: "", complete: false },
      { id: crypto.randomUUID(), category: "Payments", name: "Venue payment", assignedTo: "Darren", dueDate: "2026-10-08", priority: "Medium", notes: "", complete: true }
    ]
  },
  {
    id: crypto.randomUUID(),
    name: "Sports Day",
    date: "2027-06-12",
    tasks: []
  },
  {
    id: crypto.randomUUID(),
    name: "Christmas Light Switch-On",
    date: "2026-12-05",
    tasks: []
  }
];

let events = [];
let selectedEventId = null;

function loadLocalEvents() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (_) {}
  }
  return null;
}

async function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  try {
    events = await DuckClubAPI.saveData(events);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    updateApiStatus();
    return true;
  } catch (error) {
    console.error("Could not save event data to Azure Storage", error);
    updateApiStatus();
    alert(`The item could not be saved to Azure Storage.\n\n${error.message}`);
    return false;
  }
}

async function initialiseData() {
  const status = document.getElementById("apiStatus");
  status.textContent = "Connecting…";

  try {
    const remoteEvents = await DuckClubAPI.loadData();
    const localEvents = loadLocalEvents();

    if (remoteEvents.length) {
      events = remoteEvents;
    } else if (localEvents?.length) {
      events = localEvents;
      await DuckClubAPI.saveData(events);
    } else {
      events = defaultEvents;
      await DuckClubAPI.saveData(events);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    selectedEventId = events[0]?.id || null;
    render();
    status.textContent = "API online";
  } catch (error) {
    console.error("Could not load event data from Azure Storage", error);
    events = loadLocalEvents() || defaultEvents;
    selectedEventId = events[0]?.id || null;
    render();
    status.textContent = "API not connected";
  }
}

function selectedEvent() {
  return events.find(event => event.id === selectedEventId);
}

function progressFor(event) {
  if (!event.tasks.length) return 0;
  return Math.round(event.tasks.filter(task => task.complete).length / event.tasks.length * 100);
}

function formatDate(date) {
  if (!date) return "No date";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric"
  });
}

function render() {
  renderTabs();
  renderEvent();
}

function renderTabs() {
  document.getElementById("eventTabs").innerHTML = events.map(event => `
    <button class="event-tab ${event.id === selectedEventId ? "active" : ""}" data-event-id="${event.id}">
      ${escapeHtml(event.name)}
    </button>
  `).join("");

  document.querySelectorAll(".event-tab").forEach(button => {
    button.addEventListener("click", () => {
      selectedEventId = button.dataset.eventId;
      render();
    });
  });
}

function renderEvent() {
  const event = selectedEvent();
  const panel = document.getElementById("eventPanel");

  if (!event) {
    panel.innerHTML = `<div class="event-summary"><p>No events yet. Click "+ Add New Event" to create one.</p></div>`;
    return;
  }

  const total = event.tasks.length;
  const complete = event.tasks.filter(t => t.complete).length;
  const outstanding = total - complete;
  const overdue = event.tasks.filter(t => !t.complete && t.dueDate && new Date(`${t.dueDate}T23:59:59`) < new Date()).length;
  const progress = progressFor(event);

  panel.innerHTML = `
    <div class="event-summary">
      <div class="event-summary-top">
        <div class="event-title">
          <div class="event-title-row">
            <div>
              <h3>${escapeHtml(event.name)}</h3>
              <p>${formatDate(event.date)}</p>
            </div>
            <button class="danger-button" id="deleteEventButton" type="button">Delete Event</button>
          </div>
        </div>
        <div class="progress-box">
          <div class="progress-label"><span>Event readiness</span><span>${progress}%</span></div>
          <div class="progress-track"><div class="progress-bar" style="width:${progress}%"></div></div>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><strong>${total}</strong><span>Total items</span></div>
        <div class="stat"><strong>${complete}</strong><span>Completed</span></div>
        <div class="stat"><strong>${outstanding}</strong><span>Outstanding</span></div>
        <div class="stat"><strong>${overdue}</strong><span>Overdue</span></div>
      </div>
    </div>

    <div class="categories">
      ${categories.map(category => renderCategory(event, category)).join("")}
    </div>
  `;

  document.getElementById("deleteEventButton").addEventListener("click", deleteSelectedEvent);

  document.querySelectorAll("[data-add-task]").forEach(button => {
    button.addEventListener("click", () => openTaskModal(button.dataset.addTask));
  });

  document.querySelectorAll("[data-toggle-task]").forEach(button => {
    button.addEventListener("click", () => toggleTask(button.dataset.toggleTask));
  });

  document.querySelectorAll("[data-edit-task]").forEach(button => {
    button.addEventListener("click", () => openTaskModal(button.dataset.editTask, button.dataset.category));
  });

  document.querySelectorAll("[data-delete-task]").forEach(button => {
    button.addEventListener("click", () => deleteTask(button.dataset.deleteTask));
  });
}

function renderCategory(event, category) {
  const tasks = event.tasks.filter(task => task.category === category);
  const rows = tasks.length ? `
    <table class="task-table">
      <thead>
        <tr><th>Complete</th><th>Item</th><th>Responsible</th><th>Due</th><th>Priority</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${tasks.map(task => `
          <tr>
            <td><input type="checkbox" ${task.complete ? "checked" : ""} data-toggle-task="${task.id}"></td>
            <td class="${task.complete ? "task-done" : ""}">${escapeHtml(task.name)}</td>
            <td>${escapeHtml(task.assignedTo || "—")}</td>
            <td>${task.dueDate ? formatDate(task.dueDate) : "—"}</td>
            <td><span class="priority priority-${task.priority.toLowerCase()}">${escapeHtml(task.priority)}</span></td>
            <td class="actions">
              <button class="icon-button" data-edit-task="${task.id}" data-category="${escapeHtml(category)}">Edit</button>
              <button class="icon-button" data-delete-task="${task.id}">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : `<div class="empty-category">No items added yet.</div>`;

  return `
    <section class="category">
      <div class="category-header">
        <span class="category-name">${category}</span>
        <span>
          <span class="category-count">${tasks.filter(t => t.complete).length}/${tasks.length} complete</span>
          <button class="small-button" data-add-task="${category}">+ Add Item</button>
        </span>
      </div>
      ${rows}
    </section>
  `;
}

function openTaskModal(category, taskId = null) {
  const event = selectedEvent();
  const task = taskId ? event.tasks.find(t => t.id === taskId) : null;

  document.getElementById("modalRoot").innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h3>${task ? "Edit Item" : `Add Item — ${escapeHtml(category)}`}</h3>
        <form id="taskForm" class="form-grid">
          <div class="form-field">
            <label>Item / Task</label>
            <input name="name" required value="${escapeAttr(task?.name || "")}" placeholder="e.g. Confirm insurance">
          </div>
          <div class="form-field">
            <label>Responsible person</label>
            <input name="assignedTo" value="${escapeAttr(task?.assignedTo || "")}" placeholder="Type a name">
          </div>
          <div class="form-field">
            <label>Due date</label>
            <input type="date" name="dueDate" value="${escapeAttr(task?.dueDate || "")}">
          </div>
          <div class="form-field">
            <label>Priority</label>
            <select name="priority">
              ${["High","Medium","Low"].map(p => `<option ${p === (task?.priority || "Medium") ? "selected" : ""}>${p}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label>Notes</label>
            <textarea name="notes" placeholder="Optional notes">${escapeHtml(task?.notes || "")}</textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="secondary-button" id="cancelModal">Cancel</button>
            <button type="submit" class="primary-button">Save Item</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById("cancelModal").addEventListener("click", closeModal);
  document.getElementById("taskForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const values = {
      name: form.get("name").trim(),
      assignedTo: form.get("assignedTo").trim(),
      dueDate: form.get("dueDate"),
      priority: form.get("priority"),
      notes: form.get("notes").trim()
    };

    if (task) {
      Object.assign(task, values);
    } else {
      event.tasks.push({
        id: crypto.randomUUID(),
        category,
        ...values,
        complete: false
      });
    }

    const saved = await saveEvents();
    if (saved) {
      closeModal();
      render();
    }
  });
}

function closeModal() {
  document.getElementById("modalRoot").innerHTML = "";
}

async function deleteSelectedEvent() {
  const event = selectedEvent();
  if (!event) return;

  const taskCount = event.tasks.length;
  const message = taskCount
    ? `Delete "${event.name}" and its ${taskCount} item${taskCount === 1 ? "" : "s"}?\n\nThis cannot be undone.`
    : `Delete "${event.name}"?\n\nThis cannot be undone.`;

  if (!confirm(message)) return;

  const deletedIndex = events.findIndex(item => item.id === event.id);
  events = events.filter(item => item.id !== event.id);

  if (events.length) {
    selectedEventId = events[Math.max(0, Math.min(deletedIndex, events.length - 1))].id;
  } else {
    selectedEventId = null;
  }

  const saved = await saveEvents();
  if (saved) {
    render();
  }
}

async function toggleTask(taskId) {
  const event = selectedEvent();
  const task = event.tasks.find(t => t.id === taskId);
  if (task) {
    task.complete = !task.complete;
    const saved = await saveEvents();
    if (saved) render();
  }
}

async function deleteTask(taskId) {
  const event = selectedEvent();
  const task = event.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (!confirm(`Delete "${task.name}"?`)) return;
  event.tasks = event.tasks.filter(t => t.id !== taskId);
  const saved = await saveEvents();
  if (saved) render();
}

document.getElementById("addEventButton").addEventListener("click", () => {
  document.getElementById("modalRoot").innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h3>Add New Event</h3>
        <form id="eventForm" class="form-grid">
          <div class="form-field"><label>Event name</label><input name="name" required placeholder="e.g. Summer Fair"></div>
          <div class="form-field"><label>Event date</label><input type="date" name="date" required></div>
          <div class="modal-actions">
            <button type="button" class="secondary-button" id="cancelEvent">Cancel</button>
            <button type="submit" class="primary-button">Create Event</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById("cancelEvent").addEventListener("click", closeModal);
  document.getElementById("eventForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const event = {
      id: crypto.randomUUID(),
      name: form.get("name").trim(),
      date: form.get("date"),
      tasks: []
    };
    events.push(event);
    selectedEventId = event.id;
    const saved = await saveEvents();
    if (saved) {
      closeModal();
      render();
    }
  });
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[char]));
}
function escapeAttr(value) { return escapeHtml(value); }

async function updateApiStatus() {
  const status = document.getElementById("apiStatus");
  const result = await DuckClubAPI.health();
  status.textContent = result.ok ? "API online" : "API not connected";
}

render();
initialiseData();
