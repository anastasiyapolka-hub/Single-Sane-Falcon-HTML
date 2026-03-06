let currentUser = null;
let registerEmail = null;

async function bootstrapAuth() {
  try {
    const user = await apiFetch("/auth/me");
    setUser(user);
  } catch {
    setGuest();
  }
}

function setGuest() {
  document.getElementById("auth-open-btn").classList.remove("hidden");
  document.getElementById("user-profile").classList.add("hidden");
}

function setUser(user) {
  currentUser = user;

  document.getElementById("auth-open-btn").classList.add("hidden");
  document.getElementById("user-profile").classList.remove("hidden");

  document.getElementById("user-email").textContent = user.email;
  document.getElementById("user-plan").textContent = user.plan;

  setAvatar(user.email);
}

function setAvatar(email) {
  const hash = email.split("").reduce((a,b)=>a+b.charCodeAt(0),0);
  const index = (hash % 20) + 1;

  document.getElementById("user-avatar-img").src =
    `/images/avatars/cat-${index}.png`;
}

document.getElementById("login-submit").onclick = async () => {

  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  try {

    const user = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    setUser(user);
    closeAuthModal();

  } catch (err) {

    alert("Ошибка входа");

  }
};

document.getElementById("register-submit").onclick = async () => {

  const email = document.getElementById("register-email").value;
  const password = document.getElementById("register-password").value;
  const password2 = document.getElementById("register-password2").value;

  registerEmail = email;

  const res = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      password_confirm: password2
    })
  });

  document.getElementById("auth-view-register").classList.add("hidden");
  document.getElementById("auth-view-verify").classList.remove("hidden");

  console.log("DEV CODE:", res.dev_code);
};

document.getElementById("verify-submit").onclick = async () => {

  const code = document.getElementById("verify-code").value;

  const user = await apiFetch("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({
      email: registerEmail,
      code
    })
  });

  setUser(user);
  closeAuthModal();
};

document.getElementById("logout-btn").onclick = async () => {

  await apiFetch("/auth/logout", { method: "POST" });

  setGuest();
};

document.addEventListener("DOMContentLoaded", () => {
  bootstrapAuth();
});