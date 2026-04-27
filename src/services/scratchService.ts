import JSZip from "jszip";

export interface ScratchAsset {
  id: string;
  name: string;
  md5ext: string;
  svg: string;
  type: "sprite" | "backdrop";
  category?: string;
}

export const ASSET_LIBRARY: ScratchAsset[] = [
  // Animals
  {
    id: "b7853f55f6659857639c85222379abc0",
    name: "Scratch Cat",
    md5ext: "b7853f55f6659857639c85222379abc0.svg",
    type: "sprite",
    category: "Животные",
    svg: `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="100px" height="100px" viewBox="0 0 100 100" enable-background="new 0 0 100 100" xml:space="preserve"><circle fill="#FFAB19" cx="50" cy="50" r="40"/><circle fill="#FFFFFF" cx="35" cy="40" r="10"/><circle fill="#FFFFFF" cx="65" cy="40" r="10"/><circle fill="#000000" cx="35" cy="40" r="4"/><circle fill="#000000" cx="65" cy="40" r="4"/><path fill="#000000" d="M40,70 Q50,80 60,70" stroke="#000000" stroke-width="2" fill-opacity="0"/></svg>`,
  },
  {
    id: "dog_sprite_id",
    name: "Dog",
    md5ext: "dog.svg",
    type: "sprite",
    category: "Животные",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="#8B4513" d="M30 40 Q50 20 70 40 L70 70 Q50 90 30 70 Z"/><circle fill="white" cx="40" cy="45" r="5"/><circle fill="white" cx="60" cy="45" r="5"/><circle fill="black" cx="40" cy="45" r="2"/><circle fill="black" cx="60" cy="45" r="2"/></svg>`,
  },
  // Transport
  {
    id: "car_sprite_id",
    name: "Car",
    md5ext: "car.svg",
    type: "sprite",
    category: "Транспорт",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect fill="#4A90E2" x="20" y="50" width="60" height="20" rx="5"/><rect fill="#4A90E2" x="30" y="35" width="40" height="15" rx="5"/><circle fill="#333" cx="35" cy="70" r="8"/><circle fill="#333" cx="65" cy="70" r="8"/></svg>`,
  },
  {
    id: "rocket_sprite_id",
    name: "Rocket",
    md5ext: "rocket.svg",
    type: "sprite",
    category: "Транспорт",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="#E74C3C" d="M50 10 L70 40 L70 80 L30 80 L30 40 Z"/><path fill="#F1C40F" d="M40 80 L50 95 L60 80 Z"/><circle fill="#ECF0F1" cx="50" cy="45" r="10"/></svg>`,
  },
  // Nature / Food (Misc)
  {
    id: "e6ad8e6920c126935627a510f7a530ba",
    name: "Red Ball",
    md5ext: "e6ad8e6920c126935627a510f7a530ba.svg",
    type: "sprite",
    category: "Разное",
    svg: `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50"><circle fill="#FF0000" cx="25" cy="25" r="20"/></svg>`,
  },
  {
    id: "apple_sprite_id",
    name: "Apple",
    md5ext: "apple.svg",
    type: "sprite",
    category: "Разное",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle fill="#FF4B4B" cx="50" cy="55" r="35"/><path fill="#4CAF50" d="M50 20 Q55 10 65 15 Q55 15 50 30 Z"/></svg>`,
  },
  // Backdrops
  {
    id: "cd2151ac25304477e40417618da3091e",
    name: "Blank Backdrop",
    md5ext: "cd2151ac25304477e40417618da3091e.svg",
    type: "backdrop",
    category: "Природа",
    svg: `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><rect fill="#FFFFFF" width="480" height="360"/></svg>`,
  },
  {
    id: "83a9787d4cb6f3b7632b4ddfebf74367",
    name: "Blue Sky",
    md5ext: "83a9787d4cb6f3b7632b4ddfebf74367.svg",
    type: "backdrop",
    category: "Природа",
    svg: `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><rect fill="#87CEEB" width="480" height="360"/><rect fill="#90EE90" y="300" width="480" height="60"/></svg>`,
  },
];

export async function createSb3File(projectJson: any, customAssets: ScratchAsset[] = []): Promise<Blob> {
  const zip = new JSZip();

  // Helper to ensure target has all required fields
  const normalizeTarget = (target: any, index: number) => {
    const costumes = (target.costumes || []).map((c: any) => ({
      name: c.name || "costume",
      bitmapResolution: c.bitmapResolution || 1,
      dataFormat: c.dataFormat || "svg",
      assetId: c.assetId || c.md5ext?.split(".")[0] || "b7853f55f6659857639c85222379abc0",
      md5ext: c.md5ext || `${c.assetId}.svg` || "b7853f55f6659857639c85222379abc0.svg",
      rotationCenterX: c.rotationCenterX ?? 50,
      rotationCenterY: c.rotationCenterY ?? 50
    }));

    // Ensure at least one costume
    if (costumes.length === 0) {
      costumes.push({
        name: "costume1",
        bitmapResolution: 1,
        dataFormat: "svg",
        assetId: "b7853f55f6659857639c85222379abc0",
        md5ext: "b7853f55f6659857639c85222379abc0.svg",
        rotationCenterX: 50,
        rotationCenterY: 50
      });
    }

    return {
      isStage: !!target.isStage,
      name: target.name || (target.isStage ? "Stage" : `Sprite${index}`),
      variables: target.variables || {},
      lists: target.lists || {},
      broadcasts: target.broadcasts || {},
      blocks: target.blocks || {},
      comments: target.comments || {},
      currentCostume: target.currentCostume || 0,
      costumes,
      sounds: target.sounds || [],
      volume: target.volume ?? 100,
      layerOrder: target.layerOrder ?? index,
      ...(target.isStage ? {
        tempo: 60,
        videoTransparency: 50,
        videoState: "on",
        textToSpeechLanguage: null
      } : {
        visible: target.visible ?? true,
        x: target.x ?? 0,
        y: target.y ?? 0,
        size: target.size ?? 100,
        direction: target.direction ?? 90,
        draggable: !!target.draggable,
        rotationStyle: target.rotationStyle || "all around"
      })
    };
  };

  const targets = (projectJson.targets || []).map((t: any, i: number) => normalizeTarget(t, i));
  
  // Ensure there is at least one stage
  if (!targets.find((t: any) => t.isStage)) {
    targets.unshift(normalizeTarget({ isStage: true, name: "Stage" }, 0));
  }

  const finalProject = {
    targets,
    monitors: projectJson.monitors || [],
    extensions: projectJson.extensions || [],
    meta: projectJson.meta || {
      semver: "3.0.0",
      vm: "0.2.0",
      agent: "Mozilla/5.0",
    },
  };

  zip.file("project.json", JSON.stringify(finalProject));

  // Add library assets
  ASSET_LIBRARY.forEach((asset) => {
    zip.file(asset.md5ext, asset.svg);
  });

  // Add custom assets
  customAssets.forEach((asset) => {
    zip.file(asset.md5ext, asset.svg);
  });

  return await zip.generateAsync({ type: "blob" });
}

export const SCRATCH_PREVIEW_PROMPT = `You are a Scratch project architect. 
Based on the user's request, provide a concise plan for a Scratch project.

MODE: {MODE}
If MODE is "6th_grader":
- Think like a 12-year-old student.
- Use simple logic (mostly "if" statements, basic loops).
- Avoid complex math or advanced algorithms.
- The project should feel like a school assignment or a fun hobby project.
- Use funny or simple sprite names.

The plan should include:
1. A short title.
2. A list of sprites needed.
3. A description of the main logic (scripts).
4. A list of variables needed.

Return the plan in JSON format:
{
  "title": "...",
  "sprites": ["...", "..."],
  "scriptsDescription": "...",
  "variables": ["...", "..."]
}`;

export const SCRATCH_PROMPT_SYSTEM = `You are an expert Scratch 3.0 developer. 
Your task is to generate a valid Scratch 3.0 project.json.

MODE: {MODE}
If MODE is "6th_grader":
- Write code like a 6th grader (12 years old).
- Use simple block structures. 
- Don't use custom blocks (definitions) unless absolutely necessary.
- Use basic "if" and "forever" loops.
- Avoid complex nested logic.
- The scripts should be easy to understand for a beginner.

CRITICAL RULES FOR VALID project.json:
1. The "targets" array MUST have the Stage as the first element (isStage: true).
2. Every sprite MUST have a "costumes" array.
3. Use the provided ASSET IDs for costumes.
4. Every block MUST have an "opcode", "next", "parent", "inputs", "fields", "shadow", and "topLevel".
5. Top-level blocks MUST have "x" and "y" coordinates.

ASSET USAGE (USE THESE EXACT IDs):
- Sprites: 
  - "Scratch Cat": md5ext: "b7853f55f6659857639c85222379abc0.svg", name: "costume1"
  - "Red Ball": md5ext: "e6ad8e6920c126935627a510f7a530ba.svg", name: "ball"
- Backdrops:
  - "Blank Backdrop": md5ext: "cd2151ac25304477e40417618da3091e.svg", name: "backdrop1"
  - "Blue Sky": md5ext: "83a9787d4cb6f3b7632b4ddfebf74367.svg", name: "sky"

Example Sprite Structure:
{
  "isStage": false,
  "name": "Sprite1",
  "variables": {},
  "blocks": {
    "block_id_1": {
      "opcode": "event_whenflagclicked",
      "next": "block_id_2",
      "parent": null,
      "inputs": {},
      "fields": {},
      "shadow": false,
      "topLevel": true,
      "x": 100,
      "y": 100
    }
  },
  "costumes": [{ "name": "costume1", "md5ext": "b7853f55f6659857639c85222379abc0.svg", "dataFormat": "svg", "assetId": "b7853f55f6659857639c85222379abc0" }]
}

Return ONLY valid JSON.`;
