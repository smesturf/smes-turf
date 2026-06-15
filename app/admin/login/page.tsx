"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  useEffect(() => {
    const loggedIn = localStorage.getItem("adminLoggedIn");
    const loginTime = localStorage.getItem("adminLoginTime");

    if (loggedIn === "true" && loginTime) {
      const hoursPassed =
        (Date.now() - Number(loginTime)) /
        (1000 * 60 * 60);

      if (hoursPassed < 12) {
        router.push("/admin");
      } else {
        localStorage.removeItem("adminLoggedIn");
        localStorage.removeItem("adminLoginTime");
      }
    }
  }, [router]);

  const handleLogin = () => {
    const lockUntil = localStorage.getItem("adminLockUntil");

    if (
      lockUntil &&
      Date.now() < Number(lockUntil)
    ) {
      alert(
        "Too many failed attempts. Try again in 5 minutes."
      );
      return;
    }

    if (
      username === "admin" &&
      password === "SMES@2026"
    ) {
      localStorage.setItem("adminLoggedIn", "true");
      localStorage.setItem(
        "adminLoginTime",
        Date.now().toString()
      );

      localStorage.removeItem("loginAttempts");
      localStorage.removeItem("adminLockUntil");

      router.push("/admin");
    } else {
      const attempts =
        Number(
          localStorage.getItem("loginAttempts") || "0"
        ) + 1;

      localStorage.setItem(
        "loginAttempts",
        attempts.toString()
      );

      if (attempts >= 3) {
        localStorage.setItem(
          "adminLockUntil",
          (
            Date.now() +
            5 * 60 * 1000
          ).toString()
        );

        alert(
          "Too many failed attempts. Login locked for 5 minutes."
        );
      } else {
        alert(
          `Invalid Username or Password. ${
            3 - attempts
          } attempt(s) remaining.`
        );
      }
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-96">
        <h1 className="text-3xl font-bold mb-6 text-center">
          Admin Login
        </h1>

        <input
          type="text"
          placeholder="Username"
          className="w-full p-3 border rounded mb-4 text-black"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full p-3 border rounded mb-4 text-black"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleLogin}
          className="w-full bg-green-600 text-white py-3 rounded"
        >
          Login
        </button>
      </div>
    </main>
  );
}