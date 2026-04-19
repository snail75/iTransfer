import german from "./translations/de-DE";
import english from "./translations/en-US";
import spanish from "./translations/es-ES";
import french from "./translations/fr-FR";
import italian from "./translations/it-IT";
import portuguese from "./translations/pt-BR";

export const LOCALES = {
  GERMAN: {
    name: "Deutsch",
    code: "de-DE",
    messages: german,
  },
  ENGLISH: {
    name: "English",
    code: "en-US",
    messages: english,
  },
  ITALIAN: {
    name: "Italiano",
    code: "it-IT",
    messages: italian,
  },
  FRENCH: {
    name: "Français",
    code: "fr-FR",
    messages: french,
  },
  SPANISH: {
    name: "Español",
    code: "es-ES",
    messages: spanish,
  },
  PORTUGUESE_BRAZIL: {
    name: "Português",
    code: "pt-BR",
    messages: portuguese,
  },
};
