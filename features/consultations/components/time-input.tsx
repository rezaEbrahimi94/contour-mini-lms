"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { timeSuggestionStepMinutes as step } from "../policy";
import { clockLabel, parseClock } from "../schedule-time";
import { cn } from "@/lib/utils";

const options = Array.from({ length: (24 * 60) / step }, (_, i) =>
  clockLabel(i * step),
);
const lastOption = options.length - 1;
// With nothing typed, the list opens at the start of the working day.
const openAtMinutes = 9 * 60;
// Room the list needs below the field before it opens upward instead.
const listHeightPx = 204;

export function TimeInput({ initial = "" }: { initial?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [text, setText] = useState(initial);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [active, setActive] = useState(-1);
  const minutes = parseClock(text);
  const nearest = Math.min(
    lastOption,
    Math.round((minutes ?? openAtMinutes) / step),
  );
  useEffect(() => {
    const box = list.current;
    if (!open || !box) return;
    const item = box.children.item(active < 0 ? nearest : active);
    if (!(item instanceof HTMLElement)) return;
    // Scroll only the suggestions; the surrounding form stays in place.
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (active < 0) {
      box.scrollTop = top;
      return;
    }
    if (top < box.scrollTop) box.scrollTop = top;
    if (bottom > box.scrollTop + box.clientHeight)
      box.scrollTop = bottom - box.clientHeight;
  }, [open, active, nearest]);
  function show() {
    const rect = input.current?.getBoundingClientRect();
    const height = window.visualViewport?.height ?? window.innerHeight;
    setAbove(
      !!rect &&
        height - rect.bottom < listHeightPx &&
        rect.top > height - rect.bottom,
    );
    setOpen(true);
  }
  function choose(value: string) {
    setText(value);
    setActive(-1);
    setOpen(false);
  }
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>Start time</Label>
      <div className="relative">
        <Input
          ref={input}
          id={id}
          name="time"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? id + "-options" : undefined}
          aria-activedescendant={
            open && active >= 0 ? `${id}-${active}` : undefined
          }
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="2:30 pm"
          required
          className="pr-9 tabular-nums"
          value={text}
          onFocus={() => {
            show();
            setActive(-1);
          }}
          onClick={show}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
            if (minutes !== null) setText(clockLabel(minutes));
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              const move = e.key === "ArrowDown" ? 1 : -1;
              const next = active < 0 ? nearest : active + move;
              setActive(Math.max(0, Math.min(lastOption, next)));
            }
            if (e.key === "Escape" && open) {
              e.preventDefault();
              setOpen(false);
              setActive(-1);
            }
            if (e.key === "Enter" && open) {
              e.preventDefault();
              const option = options[active];
              if (option !== undefined) choose(option);
              else if (minutes !== null) choose(clockLabel(minutes));
              else setOpen(false);
            }
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-0.5 -translate-y-1/2 text-primary"
          aria-label="Show time suggestions"
          aria-expanded={open}
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            const wasOpen = open;
            input.current?.focus();
            setOpen(!wasOpen);
            setActive(-1);
          }}
        >
          <ChevronDown aria-hidden="true" />
        </Button>
        {open && (
          <ul
            ref={list}
            className={cn(
              "absolute inset-x-0 z-10 max-h-[min(12.5rem,36dvh)] overflow-y-auto overscroll-contain rounded-lg border bg-popover p-1 text-sm text-popover-foreground tabular-nums shadow-md",
              above ? "bottom-full mb-1" : "top-full mt-1",
            )}
            role="listbox"
            id={id + "-options"}
            aria-label="Start time suggestions"
          >
            {options.map((value, i) => (
              <li
                role="option"
                key={value}
                id={`${id}-${i}`}
                aria-selected={
                  active >= 0 ? active === i : minutes === i * step
                }
                className="cursor-pointer rounded-md px-2.5 py-2 hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  choose(value);
                }}
              >
                {value}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
