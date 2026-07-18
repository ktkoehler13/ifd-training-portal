"use client";

import { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function LandingGate() {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg shadow-zinc-200/60 sm:p-10">
        <div className="mb-8 text-center">
          <div className="mb-4 text-5xl" aria-hidden="true">
            🚒
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            IFD Training Portal
          </h1>
          <p className="mt-2 text-base text-zinc-600">Ithaca Fire Department</p>
          <p className="mt-3 text-xs font-medium tracking-wide text-zinc-400 uppercase">
            Prototype Version 0.1
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="password" className="sr-only">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
            />
          </div>
          <Button type="submit">Continue</Button>
        </form>
      </div>
    </div>
  );
}
