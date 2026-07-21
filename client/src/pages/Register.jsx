import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await register(form);
      toast.success("Account created");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.message || "Registration failed");
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
        <p className="mb-6 text-sm text-slate-500">Create your account to get started.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            name="name"
            placeholder="Full name"
            value={form.name}
            onChange={handleChange}
            required
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-calmblue"
          />
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
            minLength={6}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-calmblue"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-calmblue py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-calmblue">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
