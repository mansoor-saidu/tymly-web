---
name: Employee Attendance Tracking System
description: Friction-free daily check-ins and attendance dashboard
colors:
  primary: "#030213"
  secondary: "oklch(0.95 0.0058 264.53)"
  background: "#fffaef"
  card: "#fffdf5"
  muted: "#ececf0"
  accent: "#e9ebef"
  destructive: "#d4183d"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
spacing:
  sm: "8px"
  md: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
---

# Design System: Employee Attendance Tracking System

## 1. Overview

**Creative North Star: "The Modern Workspace"**

This design system aims for approachability and contemporary design, breaking away from the stiff, generic SaaS clichés of enterprise HR software. It uses a warm, tactile palette anchored by a sharp, highly legible typography scale. The interface optimizes for speed—particularly for field and office workers interacting with the check-in tablet—while remaining incredibly dense and focused for managers reviewing data on desktop dashboards. It actively rejects any generic, template-driven aesthetics.

**Key Characteristics:**
- Warm, inviting core backgrounds paired with strong, high-contrast typography.
- Fast, predictable interactions.
- Flat surfaces that rely on distinct borders rather than soft shadows.
- No generic SaaS boilerplate scaffolding.

## 2. Colors

The palette is built around high-contrast legibility over warm, approachable neutrals.

### Primary
- **Midnight Blue** (#030213): The primary driving color for interactive elements, brand identity, and the most critical data points. Strong and confident.

### Secondary
- **Slate Gray / Cloud** (oklch(0.95 0.0058 264.53)): Used for secondary accents and subtle emphasis.

### Neutral
- **Warm Ivory** (#fffaef): The global background. A soft, eye-friendly off-white that makes the app feel organic rather than clinical.
- **Parchment Card** (#fffdf5): Slightly lighter neutral used to pull structural cards off the base background.
- **Muted Cloud** (#ececf0): Borders, disabled states, and quiet backgrounds.

### Named Rules
**The Warm Contrast Rule.** Muted gray text must never be placed on the Warm Ivory background. Legibility is paramount, and any gray must be bumped toward Midnight Blue to ensure ≥4.5:1 contrast.

## 3. Typography

**Display Font:** Plus Jakarta Sans (with sans-serif)
**Body Font:** Inter (with sans-serif)

**Character:** Plus Jakarta Sans provides a friendly, geometric punch for headings, while Inter does the heavy lifting for data density and supreme legibility in tables and forms.

### Hierarchy
- **Display** (800, clamp/large, 1.5): Hero greetings and primary tablet check-in states.
- **Headline** (700, lg, 1.5): Section headers on the dashboard (Reports, Settings).
- **Title** (700, base, 1.5): Card titles and data table headers.
- **Body** (400, base, 1.5): Primary data rows, employee names, and descriptive text. Maximum line length of 70ch for readability.
- **Label** (500, base, normal): Form field labels and action text.

### Named Rules
**The Tight Headline Rule.** Headings use a letter-spacing of -0.025em to remain cohesive and tightly bound. Avoid loose tracking on large text.

## 4. Elevation

The system is flat-by-default. Depth is strictly reserved for interactive states like hover, focus, or floating menus.

### Shadow Vocabulary
- **Resting state**: No shadows. Borders handle separation.
- **Hover/Floating** (`box-shadow: 0 4px 12px rgba(0,0,0,0.05)`): Tooltips, popovers, and elevated hover states.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Rely on `1px` borders and background tints to separate cards from the canvas, never soft ambient shadows.

## 5. Components

Components are tactile and confident, utilizing clear borders and strong contrast.

### Buttons
- **Shape:** Softly curved (8px radius).
- **Primary:** Midnight Blue background (#030213) with crisp white text. Padding is balanced (8px top/bottom, 16px left/right).
- **Hover / Focus:** Slight opacity shift or scale; no heavy drop shadows.

### Cards / Containers
- **Corner Style:** 10px radius (lg).
- **Background:** Parchment Card (#fffdf5).
- **Shadow Strategy:** None at rest.
- **Border:** 1px solid Muted Cloud (#ececf0).
- **Internal Padding:** 16px to 24px depending on data density.

### Inputs / Fields
- **Style:** Subtle light gray background with transparent borders at rest.
- **Focus:** Strong focus ring for accessibility and tactile feedback.

### Navigation
- High-contrast active states. Sidebar utilizes the primary dark tones for contrast, or sits cleanly on the Warm Ivory background depending on the current theme block.

## 6. Do's and Don'ts

Guardrails to keep the UI from slipping back into enterprise HR clichés.

### Do:
- **Do** use exact borders (`1px solid var(--border)`) to separate content instead of drop shadows.
- **Do** ensure tablet touch targets are massive and immediately actionable.
- **Do** use `Plus Jakarta Sans` for headers to maintain the "Modern Workspace" vibe.

### Don't:
- **Don't** make it look like a generic SaaS template. Avoid standard cookie-cutter layouts that lack personality.
- **Don't** use side-stripe borders (e.g., a colored `border-left` on a card) as a decoration. Use full borders or background tints.
- **Don't** use tiny uppercase tracked eyebrows above every section. Let the headings speak for themselves.
- **Don't** use soft ambient drop shadows (`box-shadow: 0 10px 30px...`) to lift resting cards.
