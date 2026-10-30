/** Midnight Masquerade v0.2 — original independent local deduction game prototype.
 * Four-room map and compulsory colored movement are user-confirmed changes.
 * Specific connections, die probabilities and black-turn nuances are provisional
 * pending comparison with the user's printed game instructions.
 */
export const ROOMS = [
  { id: 'red', name: 'The Grand Ballroom', short: 'Ballroom', color: '#d65d66', label: 'CRIMSON', symbol: '♜', icon: '📚' },
  { id: 'green', name: 'The Secret Study', short: 'Study', color: '#66ac82', label: 'JADE', symbol: '♧', icon: '🎱' },
  { id: 'blue', name: 'The Moonlit Garden', short: 'Garden', color: '#6d9edb', label: 'SAPPHIRE', symbol: '✦', icon: '🥂' },
  { id: 'yellow', name: 'The Velvet Lounge', short: 'Lounge', color: '#e4bf6e', label: 'GOLD', symbol: '❀', icon: '🌿' }
];
// Orthogonal paths form a square board. There is NO playable central room.
export const NEIGHBORS = {
  red: ['green', 'blue'],
  green: ['red', 'yellow'],
  blue: ['red', 'yellow'],
  yellow: ['green', 'blue']
};
export const DICE = ['red', 'green', 'blue', 'yellow', 'black', 'black'];
export const COSTUMES = [
  ['astronaut', 'Astronaut'], ['ballerina', 'Ballerina'], ['cowboy', 'Cowboy'],
  ['detective', 'Detective'], ['devil', 'Devil'], ['diva', 'Diva'],
  ['fairy', 'Fairy'], ['flapper', 'Flapper'], ['jester', 'Jester'],
  ['knight', 'Knight'], ['mermaid', 'Mermaid'], ['ninja', 'Ninja'],
  ['pirate', 'Pirate'], ['princess', 'Princess'], ['robot', 'Robot'],
  ['superhero', 'Superhero'], ['vampire', 'Vampire'], ['witch', 'Witch'],
  ['wizard', 'Wizard'], ['chef', 'Chef']
];
const randomDefault = () => Math.random();
const randomIndex = (max, random) => Math.min(max - 1, Math.max(0, Math.floor(random() * max)));
export function shuffle(items, random = randomDefault) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, random);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
export function createGame(names, random = randomDefault) {
  if (!Array.isArray(names) || names.length < 2 || names.length > 8)
    throw new Error('Choose 2–8 players.');
  const clean = names.map(name => String(name).trim());
  if (clean.some(name => !name || name.length > 22))
    throw new Error('Each player needs a name of 1–22 characters.');
  if (new Set(clean.map(name => name.toLocaleLowerCase())).size !== clean.length)
    throw new Error('Give each player a unique name.');

  const shuffled = shuffle(COSTUMES, random);
  const startingRooms = shuffle(ROOMS.flatMap(room => Array(5).fill(room.id)), random);
  const guests = shuffled.map(([id, name], index) => ({
    id, name, room: startingRooms[index], status: 'party'
  }));
  const players = clean.map((name, i) => ({
    id: i + 1, name, characterId: shuffled[i][0], alive: true, draws: 0
  }));
  return {
    version: 2, phase: 'playing', players, guests,
    deck: shuffled.slice(clean.length).map(entry => entry[0]),
    activeIndex: 0, roll: null, turn: 1,
    log: [`The doors open! ${clean.length} players are mingling among twenty masked guests.`],
    winner: null
  };
}
export function activePlayer(game) { return game.players[game.activeIndex]; }
export function guestFor(game, id) { return game.guests.find(guest => guest.id === id); }
export function canMove(from, to, rolledColor) {
  return Boolean(from && to && from !== to && rolledColor !== 'black' &&
    NEIGHBORS[from]?.includes(to) && (from === rolledColor || to === rolledColor));
}
export function legalDestinations(game, guestId) {
  const guest = guestFor(game, guestId);
  if (!guest || guest.status !== 'party' || game.phase !== 'playing' || !game.roll || game.roll === 'black') return [];
  return ROOMS.map(room => room.id).filter(id => canMove(guest.room, id, game.roll));
}
export function possibleMoves(game, color) {
  if (!ROOMS.some(room => room.id === color)) return [];
  return game.guests.filter(guest => guest.status === 'party').flatMap(guest =>
    ROOMS.map(room => room.id)
      .filter(destination => canMove(guest.room, destination, color))
      .map(destination => ({ guestId: guest.id, destination }))
  );
}
export function rollDie(game, random = randomDefault) {
  if (game.phase !== 'playing' || game.roll) throw new Error('The die cannot be rolled right now.');
  // No skip control. A face with no possible move is automatically re-rolled;
  // this is an explicit PROTOTYPE workaround to avoid a stuck turn.
  const availableFaces = DICE.filter(face => face === 'black' || possibleMoves(game, face).length > 0);
  if (availableFaces.length === 0) throw new Error('No legal action is available.');
  const face = availableFaces[randomIndex(availableFaces.length, random)];
  game.roll = face;
  return face;
}
export function endTurn(game) {
  game.roll = null;
  const alive = game.players.filter(player => player.alive);
  if (alive.length <= 1) {
    game.phase = 'over';
    game.winner = alive[0]?.id ?? null;
    game.log.unshift(alive.length ? `${alive[0].name} is the last masked guest standing!` : 'Nobody survived the masquerade.');
    return;
  }
  let next = game.activeIndex;
  do { next = (next + 1) % game.players.length; } while (!game.players[next].alive);
  game.activeIndex = next;
  game.turn++;
}
export function moveGuest(game, id, destination) {
  if (game.phase !== 'playing' || !game.roll || game.roll === 'black')
    throw new Error('Roll a room color before moving.');
  const guest = guestFor(game, id);
  if (!guest || guest.status !== 'party' || !canMove(guest.room, destination, game.roll))
    throw new Error('That move is not allowed by this roll.');
  const from = ROOMS.find(room => room.id === guest.room).name;
  guest.room = destination;
  game.log.unshift(`${activePlayer(game).name} moved the ${guest.name} from the ${from} to the ${ROOMS.find(room => room.id === destination).name}.`);
  endTurn(game);
}
export function sendGuestHome(game) {
  const player = activePlayer(game);
  if (game.phase !== 'playing' || game.roll !== 'black' || !player.alive || player.draws >= 3 || game.deck.length === 0)
    throw new Error('Sending a guest home is unavailable.');
  const id = game.deck.shift();
  const guest = guestFor(game, id);
  if (!guest || guest.status !== 'party') throw new Error('The guest deck is out of sync.');
  guest.status = 'home';
  player.draws++;
  game.log.unshift(`${player.name} sent the ${guest.name} home (${player.draws}/3 passes).`);
  endTurn(game);
  return guest;
}
export function eligibleTargets(game) {
  if (game.phase !== 'playing' || game.roll !== 'black') return [];
  const player = activePlayer(game);
  if (!player.alive) return [];
  const self = guestFor(game, player.characterId);
  if (!self || self.status !== 'party') return [];
  const guests = game.guests.filter(guest => guest.status === 'party' && guest.room === self.room && guest.id !== self.id);
  return guests.length ? guests : [self];
}
export function eliminateGuest(game, id) {
  if (game.phase !== 'playing' || game.roll !== 'black') throw new Error('A black roll is needed to eliminate.');
  if (!eligibleTargets(game).some(guest => guest.id === id)) throw new Error('That guest is not a legal target.');
  const player = activePlayer(game);
  const guest = guestFor(game, id);
  guest.status = 'eliminated';
  const victim = game.players.find(other => other.characterId === id && other.alive);
  if (victim) victim.alive = false;
  game.log.unshift(`${player.name} eliminated the ${guest.name} in the ${ROOMS.find(room => room.id === guest.room).name}.${victim ? ` ${victim.name} has been unmasked!` : ''}`);
  endTurn(game);
  return { guest, victim };
}
