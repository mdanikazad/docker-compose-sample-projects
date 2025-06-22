import { useEffect, useState } from "react";

function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");

  const API_BASE = "";

  useEffect(() => {
    fetch("/tasks")
      .then((res) => res.json())
      .then(setTasks);
  }, []);

  const addTask = () => {
    fetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).then(() => window.location.reload());
  };

  const toggleDone = (id, done) => {
    fetch(`/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !done }),
    }).then(() => window.location.reload());
  };

  const deleteTask = (id) => {
    fetch(`/tasks/${id}`, {
      method: "DELETE",
    }).then(() => window.location.reload());
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Task Manager</h1>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Enter task"
      />
      <button onClick={addTask}>Add</button>
      <ul>
        {tasks.map((t) => (
          <li key={t.id}>
            <span
              onClick={() => toggleDone(t.id, t.done)}
              style={{
                textDecoration: t.done ? "line-through" : "none",
                cursor: "pointer",
              }}
            >
              {t.title}
            </span>
            <button onClick={() => deleteTask(t.id)}>❌</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;