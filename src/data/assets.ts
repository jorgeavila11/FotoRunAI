import heroMarathonRunner from '../assets/images/hero_marathon_runner_1794782115123.jpg';
import eventRioMarathon from '../assets/images/event_rio_marathon_1794782114832.jpg';
import eventSobralArch from '../assets/images/event_sobral_arch_1794782115644.jpg';
import athleteFemaleFinish from '../assets/images/athlete_female_finish_1794782116668.jpg';
import athleteHydrationSprint from '../assets/images/athlete_hydration_sprint_1794782117095.jpg';
import athletePodiumMedal from '../assets/images/athlete_podium_medal_1794782117901.jpg';
import photographerSportsAction from '../assets/images/photographer_sports_action_1794782117772.jpg';
import athleteSelfiePortrait from '../assets/images/athlete_selfie_portrait_1794782118401.jpg';

export const SEEDED_IMAGES = {
  heroMarathonRunner,
  eventRioMarathon,
  eventSobralArch,
  athleteFemaleFinish,
  athleteHydrationSprint,
  athletePodiumMedal,
  photographerSportsAction,
  athleteSelfiePortrait,
};

export const SAMPLE_SELFIES = [
  {
    id: 'sample-thiago',
    name: 'Thiago (#1042)',
    subtitle: 'Regata Laranja · Chegada',
    imageUrl: heroMarathonRunner,
    filename: 'hero_marathon_runner_1794782115123.jpg',
  },
  {
    id: 'sample-beatriz',
    name: 'Beatriz (#3821)',
    subtitle: 'Regata Azul · Pórtico',
    imageUrl: athleteFemaleFinish,
    filename: 'athlete_female_finish_1794782116668.jpg',
  },
  {
    id: 'sample-camila',
    name: 'Camila (#731)',
    subtitle: 'Medalha · Pódio 10K',
    imageUrl: athletePodiumMedal,
    filename: 'athlete_podium_medal_1794782117901.jpg',
  },
  {
    id: 'sample-matheus',
    name: 'Matheus (#412)',
    subtitle: 'Selfie Direta · Pós-Prova',
    imageUrl: athleteSelfiePortrait,
    filename: 'athlete_selfie_portrait_1794782118401.jpg',
  },
];
