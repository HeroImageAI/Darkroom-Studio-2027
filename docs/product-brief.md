DARKROOM STUDIO 2027

GREENFIELD PRODUCT BUILD

You are building a completely new application called:

DARKROOM STUDIO 2027

This is a greenfield project.

Do not recreate the previous Darkroom application feature-for-feature.

The previous Darkroom project contains valuable technical knowledge, workflows, model tests and lessons, but its product architecture became too broad and complicated.

Darkroom Studio 2027 must be designed from first principles.

The objective is:

Build a focused, intelligent local AI image studio that does fewer things exceptionally well.

1. GITHUB IS THE SOURCE OF TRUTH

This project must be developed through GitHub from the beginning.

The existing legacy repository is:

HeroImageAI/Darkroom

Treat that repository as read-only reference material unless explicitly instructed otherwise.

Do not modify or restructure it as part of this project.

Create/use a new repository named:

HeroImageAI/Darkroom-Studio-2027

If repository creation is unavailable from the current environment, prepare the local project exactly for this repository name and tell me what action is required.

The new repository must be independent from the old Darkroom application.

2. GIT DEVELOPMENT RULES

Use disciplined Git development.

The primary branch is:

main

main must represent stable, reviewed work.

Development should occur on clearly named feature branches.

Examples:

foundation
create-workspace
edit-workspace
ai-routing
smart-selection
finish-workflow
library
branding-ui

Do not accumulate huge uncommitted changes.

Commit logical milestones.

Commit messages must explain the actual product change.

Do not use meaningless messages such as:

update

changes

fix stuff

Prefer:

Create initial Darkroom Studio 2027 application shell

Add semantic ComfyUI workflow adapter

Implement non-destructive AI edit result review

etc.

Before merging major phases:

tests must pass

TypeScript must pass

production build must pass

relevant browser tests must pass

important AI workflows must be visually reviewed

Do not force-push shared work.

Do not rewrite useful history.

Do not use destructive Git operations without explicit reason and approval.

3. LEGACY DARKROOM REPOSITORY

You MAY inspect:

HeroImageAI/Darkroom

for proven technical knowledge including:

Qwen workflows

Klein workflows

SAM integration

SeedVR2

prompt routing

model discovery

workflow manifests

ComfyUI communication

model validation

GPU/VRAM lessons

crop-and-stitch editing

restoration

transparent outputs

background removal

test methodology

benchmark methodology

project recovery

version handling

Do not automatically copy its UI architecture.

Do not copy the five-studio structure.

Do not copy a feature merely because it already exists.

Every reused concept must justify its place in the new product.

The old repository is a knowledge base, not a blueprint.

4. PRODUCT DEFINITION

Darkroom Studio 2027 is:

A fast local AI image studio for turning an idea, reference image, photograph, sketch or rough artwork into a high-quality usable visual asset.

It specialises in:

image generation

reference-based generation

AI-assisted image editing

intelligent compositing

artwork extraction

product visualisation

image restoration

object removal/replacement

material and colour changes

background removal

image extension

basic exact branding placement

high-quality finishing

export

It must feel like an intelligent creative workspace rather than a collection of AI pipelines.

5. WHAT DARKROOM STUDIO 2027 IS NOT

Do not build:

Photoshop

Affinity Photo

Illustrator

Affinity Designer

Premiere

After Effects

a full DAM

a video editor

a page-layout application

a complete vector illustration program

a professional print-production suite

a visible ComfyUI node-graph interface

These applications already solve those jobs better.

Darkroom Studio 2027 exists to do something different:

Make sophisticated local AI creation and editing extremely easy.

6. PRODUCT MANTRA

Every architectural and product decision must respect:

The user chooses the result. Darkroom chooses the process.

AI complexity belongs behind the interface.

Darkroom should do fewer things exceptionally well.

Never add a feature simply because it is technically possible.

7. PRIMARY APPLICATION STRUCTURE

Darkroom Studio 2027 has only three primary destinations:

CREATE

Create visual assets.

EDIT

Change, combine and finish visual assets.

LIBRARY

Find previous work.

Do not recreate:

Pixel Studio

Vector Studio

Compose Studio

Video Studio

Production Studio

as separate primary products.

8. HOME EXPERIENCE

The application should open into an extremely simple screen.

Primary message:

What do you want to create?

Provide:

a large natural-language prompt field

drag/drop image area

paste image support

browse files

Create

Edit an image

recent work

Do not open with a complex dashboard.

The user should understand Darkroom within seconds.

9. CREATE

Create turns:

ideas

references

sketches

existing imagery

into visual candidates.

Primary visible controls:

Prompt

Natural-language creative brief.

References

Support multiple reference images.

Aspect

Simple choices:

Square

Portrait

Landscape

Vertical

Wide

Custom dimensions under Advanced.

Quality

Prefer understandable controls such as:

Draft

Final

or:

Fast

Best

Variations

1–4.

Generate

One clear primary action.

10. SUPPORTED IMAGE MODELS

Initial routing should support the strongest proven local models already available on the workstation, including:

FLUX.2 Klein 9B

Qwen-Image 2.1

Do not expose model selection as the central user experience.

Default model setting:

Auto

Optional Advanced override:

Auto

Klein

Qwen

Use empirical results from the legacy Darkroom benchmarks and QA where useful.

Do not route based solely on theoretical model capability.

11. INTELLIGENT MODEL ROUTING

Darkroom should internally know which model is stronger for particular jobs.

Possible examples:

Qwen may be preferred for:

text-sensitive imagery

layout

complex instruction following

certain reference edits

transparency where validated

Klein may be preferred for:

fast image generation

photorealistic rendering

certain restoration tasks

workflows where benchmarks prove superiority

Routing must be evidence-driven.

Record routing rules centrally.

Do not scatter model-specific decisions throughout UI components.

12. PROMPT INTELLIGENCE

Darkroom may intelligently improve user prompts.

However:

Never silently alter important intent.

Preserve:

count

colour

subject

exclusions

visible text

product features

branding

orientation

camera/viewpoint

reference requirements

If enhancement materially changes the brief, present it as a proposal.

The user remains in control of creative intent.

13. EDIT IS THE HEART OF DARKROOM

Edit uses one coherent canvas.

The user should be able to:

open an image

add images

select objects

move objects

resize

rotate

mask

paint

crop

add simple text/logo elements

issue AI instructions

compare results

keep versions

export

Avoid creating different application modes for each editing technique.

14. PRIMARY AI EDIT INTERACTION

The ideal Darkroom interaction is:

1. Indicate what you mean.

Click, select, brush, circle or describe the target.

2. Tell Darkroom what you want.

For example:

Remove this.

Make the shirt navy.

Put this logo onto the chest.

Replace this object.

Change this material to brushed aluminium.

Turn this shoe sideways.

Continue the background upward.

Restore this image.

Isolate this artwork.

3. Darkroom chooses the internal workflow.

4. Show the result.

5. User chooses:

Accept

Retry

Compare

Keep as version

The user should not need to choose:

inpainting workflow

segmentation workflow

crop-and-stitch

restoration pipeline

SAM

Qwen route

Klein route

SeedVR2

workflow graph

unless they deliberately open Advanced controls.

15. ESSENTIAL MANUAL TOOLS ONLY

Include:

Move

Transform

Brush

Eraser

Mask brush

Selection brush

Rectangle selection

Lasso

Smart Select

Crop

Pan

Zoom

Potentially:

Text

Rectangle

Ellipse

very simple path support

Do not build a huge Photoshop-style toolbar.

Manual tools primarily exist to:

guide AI

position assets

create masks

finish work

16. SMART SELECT

Smart selection is a core Darkroom capability.

Support:

click object

multiple clicks

add

subtract

brush refine

rectangle

natural-language selection

Examples:

the shirt

the orange fruit

all people

the logo

the fishing reel

Use SAM or the strongest validated local segmentation system internally.

Always let the user see the selection before important edits.

17. LAYERS

Use a focused layer model.

Support:

image layers

AI result layers

paint layers

masks

simple vector layers

text layers

visibility

lock

opacity

reorder

duplicate

delete

limited grouping

Do not reproduce every Photoshop layer feature.

Layers exist to make AI editing practical and non-destructive.

18. COMPOSITING

There is no separate Compose Studio.

Compositing happens in Edit.

The user can:

place several images

cut out subjects

move

resize

rotate

paint rough guidance

add text/logos

and then request:

Make this look like one coherent professional photograph.

Darkroom may internally:

relight

recolour

regenerate joins

rebuild shadows

harmonise

blend edges

The user does not need to know which operation was used.

19. SIMPLE BRANDING AND VECTOR SUPPORT

Darkroom must support exact branding without becoming Illustrator.

Support:

editable text

common font controls

colour

X/Y

width/height

scale

rotation

basic rectangle

ellipse

simple path where justified

fill

stroke

SVG import

SVG export

exact logo placement

Do NOT prioritise:

complex node-editing systems

complete Boolean/pathfinder systems

advanced illustration

advanced typography

complete kerning systems

advanced publishing

Affinity remains the professional vector/print tool.

20. FLAGSHIP WORKFLOW — ARTWORK EXTRACTION

This is an important Darkroom workflow.

Input examples:

shirt photograph

sleeve artwork

printed graphic

sign

packaging

logo printed on an object

Darkroom should assist with:

identify artwork

isolate it

flatten perspective

correct distortion

clean noise

preserve design

reconstruct minor missing detail where justified

preserve colour

remove irrelevant background

upscale

Possible outputs:

transparent PNG

high-resolution PNG

SVG only where genuine vectorisation is appropriate

Never label AI-reconstructed raster artwork as true vector simply because it was exported in a vector container.

21. FLAGSHIP WORKFLOW — PRODUCT PHOTOGRAPHY

Input:

ordinary product photo.

Goal:

professional commercial product presentation.

Darkroom must preserve:

actual shape

actual packaging

logo

text

colour

proportions

product features

Improve:

background

lighting

reflections

framing

presentation

shadows

cleanliness

Product fidelity is more important than creativity.

Do not let AI casually redesign a client's product.

22. FLAGSHIP WORKFLOW — CHANGE

Input:

existing image.

Select target.

Instruction examples:

Make this fabric black.

Replace this logo.

Remove the person.

Change the background.

Make the metal chrome.

Add embroidery here.

Darkroom performs the appropriate local AI operation automatically.

23. FLAGSHIP WORKFLOW — CONCEPT

Input:

sketch

references

text idea

Output:

several coherent concept directions.

Useful across:

apparel

footwear

industrial design

automotive

gaming

film/concept art

marketing

product design

Darkroom must remain industry-neutral at architecture level.

24. FLAGSHIP WORKFLOW — RESTORE

Input:

blurred photo

old photograph

low-resolution graphic

compressed JPEG

damaged image

Goal:

restore quality without unnecessarily changing identity or design.

Provide before/after comparison.

25. FLAGSHIP WORKFLOW — BACKGROUND REMOVAL

Primary action:

Remove Background

Optional:

Keep: [target description]

Example:

Keep only the bottle

Output:

transparent PNG.

Advanced segmentation options should remain hidden unless required.

26. FLAGSHIP WORKFLOW — EXPAND

Canvas can be expanded visually.

Darkroom extends the image into the new area.

The user should not need to understand "outpainting."

The interface describes the result:

Expand Image

27. FINISH

Finish is part of Edit, not another Studio.

Provide a compact finishing area containing:

Restore

Upscale

Crop

Resize

Remove background

Transparency

Export

Keep this extremely easy to understand.

28. UPSCALING

Support practical presets:

2×

4×

Custom under Advanced

Preserve alpha/transparency.

Use SeedVR2 or another validated local workflow where evidence proves it works best.

29. VERSIONING

AI editing must be non-destructive by default.

Preserve:

original

editable master

versions

exports

AI results should normally produce:

new version
or

new layer

Never casually overwrite the user's only source.

30. LIBRARY

Library should remain lightweight.

Support:

Recent

Projects/Boards

Search

Favourites

Originals

Versions

Edited masters

Exports

Recently deleted

Avoid building a complete DAM.

The primary product is Create/Edit.

31. AFFINITY HANDOFF

Affinity remains part of the real workflow.

Darkroom:

creates

edits

reconstructs

prepares

Affinity:

final production artwork

complex vector design

professional typography

layout

colour-managed print

specialised finishing

Prioritise excellent handoff.

Export:

PNG

transparent PNG

JPEG

SVG where appropriate

layered PSD where useful

native Darkroom project

Do not turn Darkroom into a professional PDF/print production system.

32. VIDEO IS OUT OF SCOPE

Do not build video generation or video editing into Darkroom Studio 2027 Core.

Potential future product:

DARKROOM MOTION

Darkroom Studio 2027 may later expose:

Animate

which hands an image to Darkroom Motion.

But there must be:

no timeline

no multi-track editing

no video production

no audio editor

no Premiere-style features

inside Darkroom Studio 2027 Core.

33. BRAND IDENTITY

The application name is:

DARKROOM

STUDIO 2027

The visual identity must feel:

premium

modern

cinematic

restrained

technical

confident

creative

Use the supplied visual reference as inspiration for mood and palette.

Do NOT copy:

ATLAS name

ATLAS logo

exact artwork

exact page layouts

proprietary branding elements

Extract only the visual language.

34. BRAND COLOUR DIRECTION

Primary environment:

Deep Black

Approximate:

#08090B

Charcoal

Approximate:

#14161A

Graphite

Approximate:

#292C31

Gunmetal

Approximate:

#45484E

Darkroom Crimson

Primary accent.

Approximate starting point:

#E31824

Deep Crimson

Approximate:

#8F1018

Soft White

Approximate:

#F2F2F3

Secondary Grey

Approximate:

#9A9CA2

These are starting values.

Build the palette as design tokens so exact colours can be refined centrally.

Do not hard-code colour values throughout components.

35. COLOUR USAGE

Red is an accent, not a background colour.

Use crimson for:

selected state

active tool

primary action

progress

focus

small highlights

AI activity

brand details

Do not flood the application with red.

Most of the interface should remain:

black

charcoal

graphite

muted grey

with white content and selective crimson accents.

36. VISUAL MOTIF

The supplied brand reference uses flowing red forms against black.

Develop a unique Darkroom visual motif inspired by:

light trails

photographic exposure

flowing illuminated ribbons

waveform-like curves

lens/light movement

darkroom photographic light

Do not copy the exact red ribbon artwork.

Create an original Darkroom motif.

Use it sparingly in:

splash/loading screen

empty states

onboarding

branding pages

subtle background decoration

Do not place decorative graphics behind the editing canvas where they interfere with work.

37. LOGO DIRECTION

Design a new original Darkroom Studio 2027 identity.

Do not reuse Atlas branding.

Explore a simple geometric symbol related to concepts such as:

aperture

frame

light

exposure

image crop

letter D

dark/light transition

Requirements:

recognisable at 16–32 px

works in one colour

works in white

works in crimson

suitable for desktop shortcut

suitable for splash screen

suitable for GitHub

not overly detailed

Do not spend excessive development time creating a complicated logo system before the product works.

Create a clean initial identity that can later be refined.

38. TYPOGRAPHY

Use a clean modern sans-serif.

Desired feeling:

geometric

premium

technical

readable

Use generous spacing for branding/headings where appropriate.

Do not use excessive letter-spacing in working UI controls.

Working-interface readability is more important than branding aesthetics.

39. APPLICATION UI

Main structure:

TOP

Darkroom identity.

Create / Edit / Library.

Project name.

Save status.

Export.

LEFT

Contextual:

tools

assets

references

layers

depending on current task.

CENTRE

Canvas/result.

This is the most important part of the application.

RIGHT

Natural-language AI instruction.

Properties.

Context controls.

Advanced section.

40. UI BEHAVIOUR

Use progressive disclosure.

The normal user should see:

what they need now

not:

everything Darkroom can possibly do.

Avoid:

huge toolbars

endless accordion sections

deeply nested settings

duplicated controls

multiple ways to perform the same task unless justified

Darkroom should feel calm despite the complexity underneath.

41. DESIGN SYSTEM

Create a proper design-token system from the beginning.

At minimum:

colours

spacing

radii

typography

shadows

borders

interaction states

focus states

panel sizes

transitions

Create reusable UI components.

Do not build every screen with independent styling rules.

The application should visually remain one product.

42. ACCESSIBILITY

Dark UI must still maintain proper contrast.

Do not rely solely on red/grey colour differences for important state.

Provide visible:

focus

hover

selected

disabled

error

success

states.

Keyboard navigation should be considered from the beginning.

43. TECHNICAL STACK

Preferred architecture:

Frontend

React

TypeScript

Vite

Backend

Node.js

Fastify or similarly lightweight framework

Persistence

SQLite

filesystem assets

Progress

WebSocket or SSE

AI backend

ComfyUI Desktop

Do not introduce unnecessary framework complexity.

44. COMFYUI ABSTRACTION

ComfyUI is an engine.

Darkroom must not expose raw node graphs in normal use.

Use semantic workflow manifests.

Example UI parameter:

prompt

may map internally to a workflow node titled:

DR_PROMPT

Never build product logic around arbitrary numeric ComfyUI node IDs.

Validate:

required nodes

required models

workflow inputs

workflow outputs

before running.

45. MODEL MANAGEMENT

Darkroom should know which models it requires.

Provide a simple setup view:

Installed

Ready.

Missing

Required.

Optional

Additional capability.

Before downloading a large model show:

model name

purpose

download size

licence/source

Never delete unrelated models.

Never silently install huge model files.

46. PERFORMANCE TARGET

Primary development workstation:

RTX 3090

24 GB VRAM

64 GB RAM

Threadripper 1950X-class CPU

Darkroom should manage limited VRAM intelligently.

Avoid keeping unnecessary models loaded simultaneously.

Where appropriate:

unload

free VRAM

queue

reuse loaded models

Detect stalled jobs.

Handle ComfyUI restarting.

Preserve job context when possible.

47. CORE DOCUMENT MODEL

Use one coherent image-document format.

Possible layer types:

raster

generated

paint

mask

text

simple vector

Do not build separate incompatible editors.

The same document should move naturally through Edit workflows.

48. PROJECT DATA

Clearly distinguish:

Original

Imported/generated source.

Master

Editable working document.

Version

Meaningful saved state.

Export

Delivery asset.

Autosave the master.

Show save state visibly.

49. TESTING PHILOSOPHY

A successful API response is not proof that an AI operation succeeded.

Test the actual requested outcome.

Example:

Instruction:

Remove the orange.

If the workflow finishes but the orange remains:

TEST FAILED

Maintain:

unit tests

TypeScript

build validation

browser/E2E tests

real ComfyUI tests

visual AI QA

50. GOLDEN QA SET

Create a small permanent test set representing real usage.

Include:

product

garment

artwork/logo

person

environment

text-sensitive image

transparent object

composite

low-quality image

sketch

Use this set when changing important workflows.

Store:

input

output

workflow/model

render time

VRAM where practical

human result assessment

51. DEVELOPMENT PHASES

Do not develop the entire application simultaneously.

PHASE 0 — PRODUCT + ARCHITECTURE

Create:

docs/DARKROOM_PRODUCT_SPEC.md

docs/DARKROOM_ARCHITECTURE.md

docs/DARKROOM_BUILD_PLAN.md

docs/BRAND_SYSTEM.md

Do not begin uncontrolled coding until these exist.

PHASE 1 — FOUNDATION

Build:

GitHub repository structure

application shell

brand system

backend

SQLite

asset handling

jobs

ComfyUI connectivity

workflow abstraction

health/status

Prove the architecture works.

PHASE 2 — CREATE

Build a genuinely usable Create workflow.

Must include:

prompt

references

Auto routing

result review

variations

version storage

Send to Edit

Do not continue until it is pleasant and reliable.

PHASE 3 — EDIT FOUNDATION

Build:

canvas

layers

transform

masks

selection

crop

Undo/Redo

autosave

No large Photoshop feature expansion.

PHASE 4 — INTELLIGENT EDIT

Build:

Select → Describe → Apply

Support initial high-value operations:

remove

replace

recolour

background change

expand

simple instruct edit

PHASE 5 — FINISH

Implement:

restore

upscale

background removal

crop/resize

transparency

export

PHASE 6 — COMPOSITE

Add:

multiple image layers

cut-outs

rough paint

harmonisation

coherent composite

No separate Compose Studio.

PHASE 7 — BRANDING TOOLS

Add limited:

text

logo placement

simple vector objects

SVG handoff

Do not build Affinity Designer.

PHASE 8 — LIBRARY

Implement:

recent

projects

versions

search

favourites

trash/recovery

Keep it lightweight.

PHASE 9 — HARDENING

Focus on:

reliability

performance

UX

model routing

compatibility

recovery

visual QA

accessibility

installation

Do not respond to this phase by adding more features.

52. PHASE GATES

At the end of every phase provide:

IMPLEMENTED

Exactly what exists.

NOT IMPLEMENTED

What remains.

TEST RESULTS

Automated results.

LIVE RESULTS

Actual browser/model validation.

KNOWN ISSUES

Unresolved problems.

GIT STATUS

Branch and commit.

RECOMMENDATION

Whether to continue.

Then STOP if the phase requires approval.

Do not silently proceed through multiple major phases unless explicitly authorised.

53. SCOPE CREEP RULE

During development you will inevitably discover interesting possibilities.

Do not implement them automatically.

Create:

docs/FUTURE_IDEAS.md

Record non-core ideas there.

Examples:

video

3D

advanced vector editing

timeline

animation

page layout

advanced PDF

full painting tools

Recording an idea is not permission to implement it.

54. FIRST CODEX TASK

Your FIRST task is NOT to build the complete application.

First:

Confirm the new GitHub repository strategy.

Create/prepare HeroImageAI/Darkroom-Studio-2027.

Initialise Git safely.

Inspect the existing Darkroom repository only for lessons.

Create the four planning documents:

docs/DARKROOM_PRODUCT_SPEC.md

docs/DARKROOM_ARCHITECTURE.md

docs/DARKROOM_BUILD_PLAN.md

docs/BRAND_SYSTEM.md

Define the exact Phase 1 repository structure.

Define the initial data model.

Define the workflow abstraction.

Define the model routing architecture.

Define the design-token/branding architecture.

Define test strategy.

Commit the planning baseline to GitHub.

Do NOT proceed into broad application development until the planning baseline is coherent.

55. BRAND REFERENCE REQUIREMENT

Use the supplied branding reference image as visual inspiration.

The desired visual qualities are:

near-black background

charcoal panels

graphite/gunmetal secondary surfaces

vivid controlled crimson

white typography

premium cinematic contrast

subtle red illumination

restrained futuristic aesthetic

sophisticated rather than gaming-oriented

professional creative-tool appearance

Do not reproduce the reference artwork literally.

Darkroom Studio 2027 must have its own identity.

56. PRODUCT SUCCESS TEST

A first-time user should understand within minutes:

Create something.

Edit something.

Finish it.

They should not need to understand:

ComfyUI

node graphs

five studios

segmentation architecture

workflow names

vector-editor architecture

video-editor architecture

dozens of models

Darkroom Studio 2027 succeeds when the technology feels powerful but the application feels simple.

57. FINAL DECISION FILTER

Before implementing anything new ask:

Does this directly improve Create, Edit or Finish?

If no:

Reject it.

Does local AI make Darkroom meaningfully better at it?

If no:

Consider Affinity or another specialised tool instead.

Will this make Darkroom easier or harder to understand?

Complexity must earn its place.

Are we exposing an implementation detail rather than a user goal?

If yes:

Move it behind the interface.

Are we adding this because it is useful or simply because it is possible?

If the latter:

Do not build it.

58. FINAL MANTRA

DARKROOM STUDIO 2027

Create. Edit. Finish.

Local AI. Professional results. Minimal friction.

The user chooses the result. Darkroom chooses the process.

Do fewer things exceptionally well.