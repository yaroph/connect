import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MainPage from "./MainPage";

const mockAppendAnswer = jest.fn();
const mockLoadDBProgressive = jest.fn();
const mockLoadSettings = jest.fn();
const mockGetUserQuestionnairesProgress = jest.fn();
const mockGetAnsweredQuestionsInQuestionnaire = jest.fn();
const mockValidateQuestionnaire = jest.fn();
const mockSyncQuestionnaireAnswers = jest.fn();
const mockMarkQuestionnaireCompleted = jest.fn();
const mockAuthMe = jest.fn();
const mockVerifyPaymentStatus = jest.fn();
const mockAdminUpdateUser = jest.fn();
const mockRecordSensible = jest.fn();
const mockEarnRandom = jest.fn();
const mockSkipRandom = jest.fn();
const mockRequestWithdraw = jest.fn();
const mockClearDBCache = jest.fn();

let mockIdCounter = 0;

jest.mock("../data/storage", () => ({
  loadDBProgressive: (...args) => mockLoadDBProgressive(...args),
  newId: (prefix = "id") => `${prefix}_${++mockIdCounter}`,
  earnRandom: (...args) => mockEarnRandom(...args),
  skipRandom: (...args) => mockSkipRandom(...args),
  recordSensible: (...args) => mockRecordSensible(...args),
  requestWithdraw: (...args) => mockRequestWithdraw(...args),
  setAuthToken: jest.fn(),
  clearSavedCredentials: jest.fn(),
  appendAnswer: (...args) => mockAppendAnswer(...args),
  adminUpdateUser: (...args) => mockAdminUpdateUser(...args),
  authMe: (...args) => mockAuthMe(...args),
  loadSettings: (...args) => mockLoadSettings(...args),
  getAnsweredQuestionsInQuestionnaire: (...args) => mockGetAnsweredQuestionsInQuestionnaire(...args),
  getUserQuestionnairesProgress: (...args) => mockGetUserQuestionnairesProgress(...args),
  validateQuestionnaire: (...args) => mockValidateQuestionnaire(...args),
  markQuestionnaireCompleted: (...args) => mockMarkQuestionnaireCompleted(...args),
  syncQuestionnaireAnswers: (...args) => mockSyncQuestionnaireAnswers(...args),
  resizeImage: jest.fn(async (value) => value),
  clearDBCache: (...args) => mockClearDBCache(...args),
  verifyPaymentStatus: (...args) => mockVerifyPaymentStatus(...args),
  isQuestionnaireActive: (qn) => Boolean(qn && qn.visible !== false && !qn.isPrivate),
}));

jest.mock("../ui/notify", () => ({
  notifyError: jest.fn(),
}));

const user = {
  id: "u_test_qn",
  prenom: "Jean",
  nom: "Test",
  fullName: "Jean Test",
  gagneSurBNI: 0,
  retrait: { status: "IDLE", amount: 0, requestedAt: null },
};

const questionnaire = {
  id: "qn_regression",
  name: "Questionnaire regression",
  visible: true,
  isPrivate: false,
  reward: 3,
  questionOrder: ["q1", "q2", "q3", "q4", "q5", "q6"],
  questionorder: ["q1", "q2", "q3", "q4", "q5", "q6"],
};

const questions = questionnaire.questionOrder.map((id, index) => ({
  id,
  questionnaire: questionnaire.id,
  title: `Question ${index + 1}`,
  type: "FREE_TEXT",
  choices: [],
  active: false,
  importance: "NORMAL",
}));

const db = {
  tags: [],
  questions,
  questionnaires: [questionnaire],
  answers: [],
  completions: [],
};

describe("MainPage questionnaire flow", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockIdCounter = 0;
    localStorage.clear();
    localStorage.setItem("bni_connect_test_qn", questionnaire.id);

    mockAppendAnswer.mockReset();
    mockLoadDBProgressive.mockReset();
    mockLoadSettings.mockReset();
    mockGetUserQuestionnairesProgress.mockReset();
    mockGetAnsweredQuestionsInQuestionnaire.mockReset();
    mockValidateQuestionnaire.mockReset();
    mockSyncQuestionnaireAnswers.mockReset();
    mockMarkQuestionnaireCompleted.mockReset();
    mockAuthMe.mockReset();
    mockVerifyPaymentStatus.mockReset();
    mockAdminUpdateUser.mockReset();
    mockRecordSensible.mockReset();
    mockEarnRandom.mockReset();
    mockSkipRandom.mockReset();
    mockRequestWithdraw.mockReset();
    mockClearDBCache.mockReset();

    mockAppendAnswer.mockResolvedValue({ ok: true });
    mockLoadDBProgressive.mockImplementation(async (onFullDataLoaded) => {
      if (onFullDataLoaded) onFullDataLoaded(db);
      return db;
    });
    mockLoadSettings.mockResolvedValue({
      randomQuestionsPerDay: 10,
      randomQuestionsPerWeek: 50,
      minimumWithdrawalAmount: 50,
      earningsPerRandomQuestion: 0.1,
      earningsPerQuestionnaire: 1,
      maxWithdrawalsPerMonth: 5,
    });
    mockGetUserQuestionnairesProgress.mockResolvedValue({ ok: true, progress: {} });
    mockGetAnsweredQuestionsInQuestionnaire.mockResolvedValue({
      ok: true,
      answeredQuestionIds: [],
      completed: false,
    });
    mockSyncQuestionnaireAnswers.mockResolvedValue({ ok: true, synced: 6 });
    mockValidateQuestionnaire.mockResolvedValue({ ok: true, pending: 1 });
    mockMarkQuestionnaireCompleted.mockResolvedValue({ ok: true, pending: 1 });
    mockAuthMe.mockResolvedValue({ ok: true, user, pending: 1 });
    mockVerifyPaymentStatus.mockResolvedValue({ ok: true, fixed: false });
    mockAdminUpdateUser.mockResolvedValue({ ok: true, user });
    mockRecordSensible.mockResolvedValue({ ok: true });
    mockEarnRandom.mockResolvedValue({ ok: true, pending: 0 });
    mockSkipRandom.mockResolvedValue({ ok: true, pending: 0 });
    mockRequestWithdraw.mockResolvedValue({ ok: true });
    mockClearDBCache.mockImplementation(() => {});

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        noQuestionsAvailable: true,
        dailyRemaining: 10,
        weeklyRemaining: 50,
        dailyLimit: 10,
        weeklyLimit: 50,
      }),
    });

    global.Image = class {
      set onload(fn) {
        this._onload = fn;
      }
      set onerror(fn) {
        this._onerror = fn;
      }
      set src(_value) {
        if (this._onload) {
          Promise.resolve().then(() => this._onload());
        }
      }
      get complete() {
        return true;
      }
      get naturalWidth() {
        return 1;
      }
      decode() {
        return Promise.resolve();
      }
    };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    localStorage.clear();
  });

  it("sends all questionnaire answers in order without skipping every other question", async () => {
    render(
      <MemoryRouter>
        <MainPage authUser={user} authPending={0} />
      </MemoryRouter>
    );

    await screen.findByText("Question 1");

    for (let index = 0; index < questions.length; index += 1) {
      const currentQuestion = questions[index];
      expect(screen.getByText(currentQuestion.title)).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText("Votre réponse..."), {
        target: { value: `Réponse ${index + 1}` },
      });
      fireEvent.click(screen.getByRole("button", { name: "Valider" }));

      await waitFor(() => expect(mockAppendAnswer).toHaveBeenCalledTimes(index + 1));
      expect(mockAppendAnswer.mock.calls[index][0]).toEqual(
        expect.objectContaining({
          questionnaireId: questionnaire.id,
          questionId: currentQuestion.id,
          answer: `Réponse ${index + 1}`,
        })
      );

      if (index < questions.length - 1) {
        await waitFor(() => expect(screen.getByText(questions[index + 1].title)).toBeInTheDocument());
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
      }
    }

    await waitFor(() => expect(mockSyncQuestionnaireAnswers.mock.calls.length).toBeGreaterThanOrEqual(questions.length));
    await waitFor(() => expect(mockMarkQuestionnaireCompleted).toHaveBeenCalledWith(questionnaire.id, user.id));
    expect(mockValidateQuestionnaire).not.toHaveBeenCalled();
    expect(mockAppendAnswer.mock.calls.map((call) => call[0].questionId)).toEqual([
      "q1",
      "q2",
      "q3",
      "q4",
      "q5",
      "q6",
    ]);
    expect(
      mockSyncQuestionnaireAnswers.mock.calls.slice(0, questions.length).map((call) => call[2].length)
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
