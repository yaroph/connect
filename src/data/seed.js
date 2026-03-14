export function makeSeedDB(now = new Date()) {
  const iso = (d) => new Date(d).toISOString();
  const user = { id: "u1", name: "Thomas" };

  const tags = [
    { id: "t_newyear", name: "Nouvel an", createdAt: iso(now) },
    { id: "t_state", name: "État", createdAt: iso(now) },
    { id: "t_fun", name: "Fun", createdAt: iso(now) },
  ];

  const questions = [
    {
      id: "q_year",
      title: "Comment s'est passée votre année 2034 ?",
      type: "FREE_TEXT",
      correctAnswer: null,
      imageUrl: null,
      importance: "SENSIBLE",
      tagId: "t_newyear",
      active: true,
      createdAt: iso(now),
      updatedAt: iso(now),
      sourceQuestionnaireId: null,
      autoManaged: false,
      lock: false,
      choices: [],
    },
    {
      id: "q_resolutions",
      title: "Quels sont vos bonne résolution pour 2035",
      type: "FREE_TEXT",
      correctAnswer: null,
      imageUrl: null,
      importance: "SENSIBLE",
      tagId: "t_newyear",
      active: true,
      createdAt: iso(now),
      updatedAt: iso(now),
      sourceQuestionnaireId: null,
      autoManaged: false,
      lock: false,
      choices: [],
    },
    {
      id: "q_intelligence",
      title: "Comment considérez-vous votre intelligence ?",
      type: "QCM",
      correctAnswer: null,
      imageUrl: "/assets/demo_reporter.jpg",
      importance: "SENSIBLE",
      tagId: "t_fun",
      active: true,
      createdAt: iso(now),
      updatedAt: iso(now),
      sourceQuestionnaireId: null,
      autoManaged: false,
      lock: false,
      choices: [
        { id: "c1", text: "Élevée", isCorrect: true },
        { id: "c2", text: "Plutôt élevée", isCorrect: true },
        { id: "c3", text: "Moyenne", isCorrect: false },
        { id: "c4", text: "Faible", isCorrect: false },
      ],
    },
    {
      id: "q_pred",
      title: "Quels sont vos prédiction pour la nouvelle année",
      type: "FREE_TEXT",
      correctAnswer: null,
      imageUrl: null,
      importance: "SENSIBLE",
      tagId: "t_newyear",
      active: false,
      createdAt: iso(now),
      updatedAt: iso(now),
      sourceQuestionnaireId: "qn_newyear",
      autoManaged: true,
      lock: false,
      choices: [],
    },
  ];

  const questionnaires = [
    {
      id: "qn_newyear",
      name: "Questionnaire du Nouvel An (2000$)",
      reward: 500.0,
      visible: true,
      endDate: null,
      isPrivate: false,
      code: "",
      questionOrder: ["q_year", "q_resolutions", "q_intelligence", "q_pred"],
      createdAt: iso(new Date(now.getTime() - 1000 * 60 * 60 * 24)),
      updatedAt: iso(now),
    },
    {
      id: "qn_lspd_private",
      name: "Questionnaire reservé à la POLICE LSPD",
      reward: 0.0,
      visible: false,
      endDate: null,
      isPrivate: true,
      code: "LSPD",
      questionOrder: [],
      createdAt: iso(new Date(now.getTime() - 1000 * 60 * 60 * 48)),
      updatedAt: iso(now),
    },
  ];

  return {
    meta: { version: 1, createdAt: iso(now), updatedAt: iso(now) },
    user,
    tags,
    questions,
    questionnaires,
    answers: [],
    completions: [],
  };
}
