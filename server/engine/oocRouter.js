'use strict';

const { TRAVEL_ENCOUNTER_THRESHOLD } = require('../config/constants');

function parseOocCommand(rawInput) {
  const text = String(rawInput || '').trim();
  if (!text) return null;

  const travelMatch = text.match(/^letsGoTo\s+(.+)$/i);
  if (travelMatch) {
    return {
      isOoc: true,
      command: 'letsGoTo',
      arg: travelMatch[1].trim(),
      raw: text,
    };
  }

  const analysisMatch = text.match(/^analysis:\s*([a-zA-Z]+)(?:\s+(.*))?$/i);
  if (!analysisMatch) return null;

  const cmd = analysisMatch[1].toLowerCase();
  const arg = (analysisMatch[2] || '').trim();

  const known = {
    setup: 'setup',
    loadgame: 'loadGame',
    savegame: 'saveGame',
    saveandquit: 'saveAndQuit',
    pauserole: 'pauseRole',
    resumerole: 'resumeRole',
    rewind: 'rewind',
    fastforward: 'fastForward',
    help: 'help',
    paintmeapicture: 'paintMeAPicture',
    exitchar: 'exitChar',
    joinchar: 'joinChar',
  };

  if (!known[cmd]) return null;

  return {
    isOoc: true,
    command: known[cmd],
    arg,
    raw: text,
  };
}

function buildHelpResponse(campaignState, topic = '') {
  const isSetup = campaignState?.narratorState?.currentProcess === 'setup';
  const categories = campaignState?.globalState?.settingCategories || [];
  const topicNote = topic ? ` regarding "${topic}"` : '';

  if (isSetup) {
    return {
      mode: 'OVERT',
      message:
        `[Setup Help${topicNote}] Complete each setup stage in sequence: Ignition -> Setting -> Campaign Parameters -> Character Creation (<=40 attribute points) -> Full-Body Portrait Approval -> World Ignition. Commands available: analysis: setup, analysis: loadGame, analysis: saveGame, analysis: rewind [n], analysis: fastForward, analysis: paintMeAPicture, letsGoTo [location].`,
    };
  }

  // Diegetic In-World Mode during active play
  if (categories.includes('SciFi')) {
    return {
      mode: 'DIEGETIC',
      message:
        `Your wrist-mounted tactical HUD flickers with amber telemetry${topicNote}: your neural link can log tactical states (save), scrub optical playback (rewind), render a holo-still (paintMeAPicture), or plot transit vectors (letsGoTo). Check your webbing capacity before reaching for gear.`,
    };
  }
  if (categories.includes('Fantasy')) {
    return {
      mode: 'DIEGETIC',
      message:
        `A faint memory of your mentor's whisper settles behind your thoughts${topicNote}: weigh your pack before drawing steel, watch the cover of stone and timber, and remember that every bond forged in earnest deepens into lasting fate.`,
    };
  }
  return {
    mode: 'DIEGETIC',
    message:
      `A sharp flash of streetwise intuition cuts through the noise${topicNote}: know what is actually in your coat pockets, read the room before pushing a hard line, and keep track of who owes you a favor when the rain starts falling.`,
  };
}

async function routeOocCommand({
  parsed,
  campaignState,
  chronoSeed,
  snapshotStore,
  mediaPipeline,
  saveHandler,
}) {
  const cmd = parsed.command;

  switch (cmd) {
    case 'setup':
      campaignState.narratorState.currentProcess = 'setup';
      campaignState.narratorState.currentStep = 'ignition';
      return {
        handled: true,
        mutatedState: true,
        command: cmd,
        systemMessage: 'Returned to Setup Ignition. You may load an existing save or configure a new campaign.',
        campaignState,
      };

    case 'pauseRole':
      campaignState.narratorState.paused = true;
      return {
        handled: true,
        mutatedState: true,
        command: cmd,
        systemMessage: 'Roleplay paused. Story clock and turn counter are frozen until you run `analysis: resumeRole`.',
        campaignState,
      };

    case 'resumeRole':
      campaignState.narratorState.paused = false;
      return {
        handled: true,
        mutatedState: true,
        command: cmd,
        systemMessage: 'Roleplay resumed. The scene picks up exactly where you left off.',
        campaignState,
      };

    case 'help': {
      const help = buildHelpResponse(campaignState, parsed.arg);
      return {
        handled: true,
        mutatedState: false,
        command: cmd,
        helpMode: help.mode,
        systemMessage: help.message,
        campaignState,
      };
    }

    case 'rewind': {
      const steps = Math.max(1, parseInt(parsed.arg || '1', 10) || 1);
      const currentTurn = campaignState.metaData.turnNumber || 0;
      const targetTurn = Math.max(0, currentTurn - steps);
      if (!snapshotStore || typeof snapshotStore.getSnapshot !== 'function') {
        return {
          handled: true,
          mutatedState: false,
          command: cmd,
          systemMessage: 'Snapshot store unavailable for rewind.',
          campaignState,
        };
      }
      const restored = await snapshotStore.getSnapshot(targetTurn);
      if (!restored) {
        return {
          handled: true,
          mutatedState: false,
          command: cmd,
          systemMessage: `No snapshot found for turn ${targetTurn}.`,
          campaignState,
        };
      }
      return {
        handled: true,
        mutatedState: true,
        command: cmd,
        restoredTurn: targetTurn,
        systemMessage: `Rewound campaign state verbatim to Turn ${targetTurn}.`,
        campaignState: restored,
      };
    }

    case 'fastForward': {
      if (!snapshotStore || typeof snapshotStore.getLatestSnapshot !== 'function') {
        return {
          handled: true,
          mutatedState: false,
          command: cmd,
          systemMessage: 'Snapshot store unavailable for fastForward.',
          campaignState,
        };
      }
      const latest = await snapshotStore.getLatestSnapshot();
      if (!latest) {
        return {
          handled: true,
          mutatedState: false,
          command: cmd,
          systemMessage: 'Already at the latest recorded turn.',
          campaignState,
        };
      }
      return {
        handled: true,
        mutatedState: true,
        command: cmd,
        restoredTurn: latest.metaData.turnNumber,
        systemMessage: `Fast-forwarded to latest snapshot (Turn ${latest.metaData.turnNumber}).`,
        campaignState: latest,
      };
    }

    case 'saveGame':
    case 'saveAndQuit': {
      const saveResult = typeof saveHandler === 'function'
        ? await saveHandler(campaignState)
        : { saved: true };
      if (cmd === 'saveAndQuit') {
        campaignState.narratorState.paused = true;
      }
      return {
        handled: true,
        mutatedState: true,
        command: cmd,
        saveResult,
        systemMessage:
          cmd === 'saveAndQuit'
            ? 'Campaign synchronized to Cloud & Drive. Session paused safely.'
            : 'Campaign synchronized to Cloud & Drive.',
        campaignState,
      };
    }

    case 'loadGame':
      return {
        handled: true,
        mutatedState: false,
        command: cmd,
        actionRequired: 'OPEN_LOAD_MODAL',
        systemMessage: 'Select a saved campaign from Firestore or upload a DeLaval_Save_*.json file from Google Drive.',
        campaignState,
      };

    case 'paintMeAPicture': {
      const brief = parsed.arg || campaignState.sceneMemory?.currentScene?.summary || 'Dramatic scene moment';
      let panel = null;
      if (mediaPipeline && typeof mediaPipeline.generateScenePanel === 'function') {
        panel = await mediaPipeline.generateScenePanel({
          uid: campaignState.ownerUid,
          campaignId: campaignState.id,
          brief,
          campaignState,
        });
      }
      return {
        handled: true,
        mutatedState: false,
        command: cmd,
        panel,
        systemMessage: panel
          ? 'Rendered graphic-novel scene panel using active character references.'
          : 'Scene illustration queued.',
        campaignState,
      };
    }

    case 'exitChar': {
      const targetId = parsed.arg;
      const players = campaignState.activeEntities.players || [];
      const idx = players.findIndex((p) => p.id === targetId || p.name.toLowerCase() === targetId.toLowerCase());
      if (idx === -1) {
        return {
          handled: true,
          mutatedState: false,
          command: cmd,
          systemMessage: `No active party character matched "${targetId}".`,
          campaignState,
        };
      }
      const [removed] = players.splice(idx, 1);
      campaignState.globalState.playerCount = Math.max(1, players.length);
      return {
        handled: true,
        mutatedState: true,
        command: cmd,
        systemMessage: `${removed.name || removed.id} stepped away from the active party.`,
        campaignState,
      };
    }

    case 'joinChar': {
      let newChar = null;
      if (parsed.arg) {
        try {
          newChar = JSON.parse(parsed.arg);
        } catch (_) {
          newChar = {
            id: `pc_${(campaignState.activeEntities.players.length || 0) + 1}`,
            name: parsed.arg,
            approvedPortraitRef: null,
            physicalTraits: { age: 28, race: 'Undeclared', build: 'Undeclared', hair: 'Undeclared', notableFeatures: 'Undeclared' },
            coreAttributes: { strength: 5, agility: 5, intellect: 5, charisma: 5, perception: 5, constitution: 5, luck: 5 },
            combatStats: { health: 100, maxHealth: 100, armorClass: 10, movementSpeed: 30, actionPoints: 2, hunkered: false, overwatch: false, encumbrancePenalty: false, luckCharges: 0, stressLevel: 0 },
            skills: {},
            psychologicalState: { oceanTraits: { openness: 5, conscientiousness: 5, extraversion: 5, agreeableness: 5, neuroticism: 5 }, flaws: [], fears: [], behavioralDirectives: [], inferred_XYZ_Coordinates: '0,0,0' },
            inventory: { wornClothing: [], carriedItems: [] },
          };
        }
      }
      if (!newChar) {
        return {
          handled: true,
          mutatedState: false,
          command: cmd,
          systemMessage: 'Provide a character name or JSON payload after `analysis: joinChar`.',
          campaignState,
        };
      }
      campaignState.activeEntities.players.push(newChar);
      campaignState.globalState.playerCount = campaignState.activeEntities.players.length;
      return {
        handled: true,
        mutatedState: true,
        command: cmd,
        systemMessage: `${newChar.name || newChar.id} joined the active party.`,
        campaignState,
      };
    }

    case 'letsGoTo': {
      const dest = parsed.arg;
      const roll = chronoSeed.rollD100();
      const travelEncounter = roll >= TRAVEL_ENCOUNTER_THRESHOLD;
      const locId = `loc_${dest.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
      campaignState.sceneMemory.currentScene.locationId = locId;
      if (!campaignState.worldState.locations.some((l) => l.id === locId)) {
        campaignState.worldState.locations.push({ id: locId, name: dest, visitedAt: new Date().toISOString() });
      }
      return {
        handled: false, // Passes through to LLM narrator with @TRAVEL_ENCOUNTER flag
        mutatedState: true,
        command: cmd,
        travelContext: {
          destination: dest,
          locationId: locId,
          d100Roll: roll,
          travelEncounter,
        },
        campaignState,
      };
    }

    default:
      return null;
  }
}

module.exports = {
  parseOocCommand,
  buildHelpResponse,
  routeOocCommand,
};
