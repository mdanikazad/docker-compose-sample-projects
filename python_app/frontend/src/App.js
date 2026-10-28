import { useEffect, useState } from "react";

const API_BASE = "/api";

function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTasks = () => {
    setLoading(true);
    fetch(`${API_BASE}/tasks`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setTasks(data);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const addTask = () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    fetch(`${API_BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    })
      .then(() => {
        setTitle("");
        loadTasks();
      })
      .catch((err) => setError(err.message));
  };

  const toggleDone = (task) => {
    fetch(`${API_BASE}/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.done }),
    })
      .then(loadTasks)
      .catch((err) => setError(err.message));
  };

  const deleteTask = (id) => {
    fetch(`${API_BASE}/tasks/${id}`, { method: "DELETE" })
      .then(loadTasks)
      .catch((err) => setError(err.message));
  };

  const visibleTasks = tasks.filter((task) => {
    if (filter === "active") return !task.done;
    if (filter === "done") return task.done;
    return true;
  });

  const remaining = tasks.filter((task) => !task.done).length;
  const completed = tasks.length - remaining;

  return (
    <div className="app-shell">
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />
      <div className="aurora aurora-three" />

      <header className="hero">
        <p className="eyebrow">Docker Compose Sample</p>
        <h1 className="title">
          Task <span className="title-accent">Manager</span>
        </h1>
        <p className="subtitle">
          React &middot; Flask &middot; PostgreSQL &mdash; wired together with
          Docker Compose.
        </p>

        <div className="stats">
          <div className="stat-card stat-total">
            <span className="stat-value">{tasks.length}</span>
            <span className="stat-label">Total</span>
          </div>
          <div className="stat-card stat-active">
            <span className="stat-value">{remaining}</span>
            <span className="stat-label">Active</span>
          </div>
          <div className="stat-card stat-done">
            <span className="stat-value">{completed}</span>
            <span className="stat-label">Completed</span>
          </div>
        </div>
      </header>

      <main className="panel">
        <div className="composer">
          <input
            className="task-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="What needs doing?"
            aria-label="New task"
          />
          <button className="btn-add" onClick={addTask}>
            Add Task
          </button>
        </div>

        <div className="filters" role="group" aria-label="Filter tasks">
          {["all", "active", "done"].map((option) => (
            <button
              key={option}
              className={`filter-btn ${filter === option ? "is-active" : ""}`}
              onClick={() => setFilter(option)}
            >
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>

        {error && <div className="alert">Could not reach the API: {error}</div>}

        {loading ? (
          <div className="state-msg">Loading tasks…</div>
        ) : visibleTasks.length === 0 ? (
          <div className="state-msg empty">
            {tasks.length === 0
              ? "No tasks yet — add your first one above."
              : `No ${filter} tasks right now.`}
          </div>
        ) : (
          <ul className="task-list">
            {visibleTasks.map((task) => (
              <li key={task.id} className={`task-item ${task.done ? "is-done" : ""}`}>
                <button
                  className="checkbox"
                  onClick={() => toggleDone(task)}
                  aria-label={task.done ? "Mark as active" : "Mark as done"}
                >
                  {task.done && <span className="checkmark">✓</span>}
                </button>
                <span className="task-title" onClick={() => toggleDone(task)}>
                  {task.title}
                </span>
                <button
                  className="btn-delete"
                  onClick={() => deleteTask(task.id)}
                  aria-label={`Delete ${task.title}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="footer">
        Running at <code>http://localhost:3000</code> &middot; API at{" "}
        <code>http://localhost:5001</code>
      </footer>
    </div>
  );
}

export default App;
