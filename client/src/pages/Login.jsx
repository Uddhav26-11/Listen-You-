import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(form);
      toast.success("Welcome back");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-softblue via-white to-lightgreen px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-2xl bg-white/70 p-8 shadow-xl backdrop-blur-sm"
      >
        <h1 className="mb-1 text-2xl font-semibold text-slate-800">Listen You!</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in to continue your consultation.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-calmblue"
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            required
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-calmblue"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-calmblue py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Don't have an account?{" "}
          <Link to="/register" className="font-medium text-calmblue">
            Register
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
