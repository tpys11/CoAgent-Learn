/**
 * react-quiz-component 无内置类型且无 @types 包，这里做最小类型边界声明。
 * 组件逻辑内不使用 any；QuizViewer 传入的数据走自有接口校验。
 */
declare module 'react-quiz-component' {
  import * as React from 'react'

  export interface QuizQuestion {
    question: string
    questionType?: 'text' | 'photo'
    answerSelectionType?: 'single' | 'multiple'
    answers: string[]
    correctAnswer: string | string[]
    messageForCorrectAnswer?: string
    messageForIncorrectAnswer?: string
    explanation?: string
    point?: number
    segment?: string
    questionPic?: string
  }

  export interface QuizData {
    quizTitle: string
    quizSynopsis?: string
    nrOfQuestions?: number
    progressBarColor?: string
    questions: QuizQuestion[]
  }

  export interface QuizProps {
    quiz: QuizData
    shuffle?: boolean
    shuffleAnswer?: boolean
    showDefaultResult?: boolean
    onComplete?: (summary: unknown) => void
    customResultPage?: (summary: unknown) => React.ReactElement
    showInstantFeedback?: boolean
    continueTillCorrect?: boolean
    revealAnswerOnSubmit?: boolean
    allowNavigation?: boolean
    onQuestionSubmit?: (data: unknown) => void
    disableSynopsis?: boolean
    timer?: number
    allowPauseTimer?: boolean
    enableProgressBar?: boolean
    appLocale?: Record<string, string>
  }

  const Quiz: React.FC<QuizProps>
  export default Quiz
}