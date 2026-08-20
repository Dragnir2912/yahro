export type AppLanguage = "fr" | "en";

export const commonMessages = {
  fr: {
    close: "Fermer",
    cancel: "Annuler",
    save: "Enregistrer",
    comingSoon: "Bientôt disponible",
    accountRequired: "Compte requis",
    demoPreview: "Aperçu de démonstration",
  },
  en: {
    close: "Close",
    cancel: "Cancel",
    save: "Save",
    comingSoon: "Coming soon",
    accountRequired: "Account required",
    demoPreview: "Demo preview",
  },
} as const;

export function commonText(language: AppLanguage, key: keyof typeof commonMessages.fr) {
  return commonMessages[language][key];
}

export const projectMessages = {
  fr: {
    description: "Planifiez un budget ponctuel et suivez chaque dépense jusqu'à son terme.",
    planned: "Planifiés",
    completed: "Terminés",
    activity: "Activité",
    expenses: "dépenses",
    addExpense: "Ajouter une dépense",
    budgetUsed: "du budget utilisé",
    exceeded: "Budget dépassé",
    createTitle: "Créer un projet ou une activité",
    creating: "Création...",
    create: "Créer",
    saveExpense: "Enregistrer la dépense",
  },
  en: {
    description: "Plan a one-off budget and track each expense through completion.",
    planned: "Planned",
    completed: "Completed",
    activity: "Activity",
    expenses: "expenses",
    addExpense: "Add expense",
    budgetUsed: "of budget used",
    exceeded: "Budget exceeded",
    createTitle: "Create a project or activity",
    creating: "Creating...",
    create: "Create",
    saveExpense: "Save expense",
  },
} as const;
