export interface Translations {
  common: {
    appName: string
    tagline: string
    language: string
    english: string
    malay: string
    loading: string
    error: string
    success: string
    save: string
    cancel: string
    confirm: string
    back: string
    signOut: string
    adminBadge: string
    mainNavigation: string
    toggleNav: string
  }
  lexi: {
    title: string
    greeting: string
    inputPlaceholder: string
    send: string
    thinking: string
    generalKnowledgeLabel: string
    errorMessage: string
    clearChat: string
    suggestionsLabel: string
    chipFindTrainers: string
    chipAvailability: string
    chipHistory: string
    chipOpenCalendar: string
    chipOpenEngagements: string
    chipHowCost: string
    chipWhatIsModeB: string
  }
  notif: {
    title: string
    empty: string
    markAllRead: string
    openAria: string
  }
  landing: {
    heroDescription: string
    featureMap: string
    featureMatching: string
    featureCost: string
    featureSecure: string
    footerText: string
  }
  auth: {
    heroBadge: string
    heroTitle: string
    chipTravel: string
    chipBilingual: string
    heroFooter: string
    loginTitle: string
    loginSubtitle: string
    registerTitle: string
    registerSubtitle: string
    forgotPassword: string
    resetPasswordTitle: string
    resetPasswordSubtitle: string
    resetPasswordSent: string
    updatePasswordTitle: string
    updatePasswordSubtitle: string
    emailLabel: string
    passwordLabel: string
    newPasswordLabel: string
    confirmPasswordLabel: string
    fullNameLabel: string
    signIn: string
    register: string
    sendResetLink: string
    updatePassword: string
    noAccount: string
    haveAccount: string
    backToLogin: string
    emailNotAllowed: string
    checkEmail: string
    passwordsNoMatch: string
    passwordTooShort: string
    emailInvalid: string
    domainHint: string
    districtLabel: string
    districtPlaceholder: string
    districtHint: string
    statewideOption: string
    districtRequiredError: string
  }
  approval: {
    title: string
    message: string
    contactAdmin: string
    signOut: string
  }
  dashboard: {
    title: string
    welcome: string
    subtitle: string
    comingSoon: string
  }
  map: {
    heatmap: string
    allSkillsSubjects: string
    skillsGroup: string
    subjectsGroup: string
    searchRadius: string
    kmUnit: string
    dropPin: string
    clearCentre: string
    useMyLocation: string
    statewideView: string
    myDistrict: string
    trainersFound: string
    noTrainersFound: string
    loadingMap: string
    pinInstruction: string
    radiusLabel: string
    modeA: string
    modeB: string
    navDashboard: string
    navSearch: string
    navEngagements: string
    navAdmin: string
    navDatabase: string
    navAnalytics: string
    navAudit: string
    navReports: string
    navTalent: string
    navTrainerFeedback: string
    navCalendar: string
    navSettings: string
    assistant: string
    collapseNav: string
    expandNav: string
    openAssistant: string
    closeAssistant: string
    assistantComingSoon: string
    distributionView: string
    zoomOutOverview: string
    clickToExplore: string
    modeALabel: string
    modeBLabel: string
    venueLabel: string
    venuePlaceholder: string
    clearVenue: string
    dropVenuePin: string
    filterBySkill: string
    venueNotSet: string
    customLocation: string
    registryBadge: string
    geocodeBadge: string
    startDate: string
    endDate: string
    trainingTitle: string
    findAvailableTrainers: string
    findingTrainers: string
    recommendations: string
    rankLabel: string
    distanceLabel: string
    durationLabel: string
    transportLabel: string
    estimatedCost: string
    costRoundTrip: string
    costSourceFormula: string
    costSourceEstimate: string
    noAvailableTrainers: string
    setDatesToSearch: string
    engagementRef: string
    trainersNeeded: string
  }
  batchInvite: {
    selectTrainers: string
    selectedLabel: string
    finalizeAndInviteSelected: string
    reviewModalTitle: string
    subjectLabel: string
    bodyLabel: string
    mergeFieldsHint: string
    previewAsLabel: string
    previewLinkNote: string
    sendToAll: string
    sending: string
    sendResultsTitle: string
    sendSuccessOne: string
    sendFailedOne: string
    sentNoEmail: string
    retryFailed: string
    done: string
    invitedTrainersLabel: string
    refreshStatus: string
  }
  calendar: {
    title: string
    subtitle: string
    subtitleUser: string
    today: string
    prevMonth: string
    nextMonth: string
    trainerFilterPlaceholder: string
    clearFilter: string
    noEngagements: string
    untitled: string
    venueLabel: string
    datesLabel: string
    statusLabel: string
    confirmedWord: string
    trainersLabel: string
    noTrainersYet: string
    openBacklog: string
    close: string
    showDrafts: string
    editWorkshop: string
    titleFieldLabel: string
    startLabel: string
    endLabel: string
    saving: string
    rescheduleNote: string
    rescheduleConfirm: string
    rescheduleResultTitle: string
    rescheduleEmailOk: string
    rescheduleEmailFailed: string
    rescheduleNoTrainers: string
    cancelWorkshop: string
    cancelConfirm: string
    deleteDraft: string
    deleteConfirm: string
  }
  adminDb: {
    title: string
    subtitle: string
    searchPlaceholder: string
    totalRows: string
    addRow: string
    editRow: string
    deleteRow: string
    deleteConfirm: string
    softDeleteConfirm: string
    deletedToggle: string
    deletedAtCol: string
    restoreRow: string
    restoreConfirm: string
    actionsCol: string
    noRows: string
    save: string
    savingLabel: string
    prevPage: string
    nextPage: string
  }
  audit: {
    title: string
    subtitle: string
    searchPlaceholder: string
    allActions: string
    fromDate: string
    toDate: string
    shownSuffix: string
    clearFilters: string
    thWhen: string
    thActor: string
    thAction: string
    thEntity: string
    thDetails: string
    noRows: string
    systemActor: string
  }
  analytics: {
    title: string
    subtitle: string
    noData: string
    tileTrainers: string
    tileWorkshops: string
    tileConfirmedSuffix: string
    tileInvites: string
    tileAcceptRate: string
    tileDistricts: string
    tileDesertsSuffix: string
    adoptTitle: string
    adoptSubtitle: string
    adoptConfirmed: string
    adoptPending: string
    adoptDeclined: string
    adoptAcceptRate: string
    adoptStaffed: string
    adoptStaffedSub: string
    overlapTitle: string
    overlapSubtitle: string
    overlapNone: string
    overlapFound: string
    overlapNote: string
    costTitle: string
    costSubtitle: string
    costFilterLabel: string
    costFilterAll: string
    costDownloadCsv: string
    costDownloadPdf: string
    costAccuracy: string
    costAccuracySub: string
    costMae: string
    costWithActuals: string
    costTotalEstimated: string
    costThEngagement: string
    costThTrainer: string
    costThMode: string
    costThEstimated: string
    costThActual: string
    costThVariance: string
    costEnterActual: string
    costSave: string
    costInvalidNumber: string
    costNoRows: string
    costNote: string
    covTitle: string
    covSubtitle: string
    covDesertBadge: string
    covNoTrainers: string
  }
  reports: {
    title: string
    subtitleAdmin: string
    subtitleUser: string
    migrationBanner: string
    searchPlaceholder: string
    fromDate: string
    toDate: string
    allDistricts: string
    allWorkshops: string
    allStatuses: string
    allResponses: string
    exportCsv: string
    noWorkshops: string
    noTrainers: string
    untitled: string
    footnote: string
    chipWorkshops: string
    chipInvited: string
    chipAccepted: string
    chipPending: string
    chipDeclined: string
    chipEstCost: string
    thWorkshop: string
    thDates: string
    thDistrict: string
    thStatus: string
    thInvited: string
    thAccepted: string
    thPending: string
    thDeclined: string
    thEstCost: string
    costInvitedPrefix: string
    thTrainer: string
    thTrainerDistrict: string
    thResponse: string
    thResponded: string
    thDistance: string
    thEstCostT: string
    thActualCost: string
    thClassification: string
    aiSuggestBtn: string
    aiSuggesting: string
    aiSuggestionPrefix: string
    aiDisclaimer: string
    approveBtn: string
    overrideLabel: string
    decidedLabel: string
    stDraft: string
    stPendingInvite: string
    stConfirmed: string
    stDeclined: string
    stCancelled: string
    clsSuitable: string
    clsPendingReview: string
    clsNotMatched: string
    clsConfirmed: string
    clsDeclined: string
  }
  talent: {
    title: string
    subtitle: string
    searchPlaceholder: string
    allDistricts: string
    dateFrom: string
    dateTo: string
    availAll: string
    availAvailable: string
    availEngaged: string
    radiusTitle: string
    dropCentre: string
    dropCentreActive: string
    clearCentre: string
    trainersShown: string
    districtsCovered: string
    desertsChip: string
    congestedChip: string
    legendTitle: string
    pinLegendTitle: string
    insightsHint: string
    legendNone: string
    legendLow: string
    legendHigh: string
    legendNormal: string
    desertsTitle: string
    congestedTitle: string
    noneFlagged: string
    trainerPanelTitle: string
    school: string
    district: string
    coordinates: string
    roles: string
    skills: string
    subjects: string
    noSchool: string
    clearSelection: string
    zoomHint: string
    transferBtn: string
    transferTitle: string
    transferIntro: string
    transferSearchLabel: string
    transferOr: string
    transferPinBtn: string
    transferPinHint: string
    transferPinCancel: string
    currentLabel: string
    newLabel: string
    districtChangeNote: string
    keepDistrictNote: string
    confirmBtn: string
    confirming: string
    cancelBtn: string
    transferFailed: string
    auditNote: string
    loading: string
  }
  invitationResponse: {
    acceptedTitle: string
    acceptedMessage: string
    declinedTitle: string
    declinedMessage: string
    expiredTitle: string
    expiredMessage: string
    alreadyUsedTitle: string
    alreadyUsedMessage: string
    invalidTitle: string
    invalidMessage: string
    confirmAcceptTitle: string
    confirmDeclineTitle: string
    confirmAcceptMessage: string
    confirmDeclineMessage: string
    confirmAcceptBtn: string
    confirmDeclineBtn: string
    confirmSubmitting: string
    confirmNote: string
    closeNote: string
    labelProgramme: string
    labelVenue: string
    labelDates: string
  }
  settings: {
    title: string
    subtitle: string
    profileTitle: string
    emailLabel: string
    roleLabel: string
    roleAdmin: string
    roleUser: string
    districtLabel: string
    statewide: string
    nameTitle: string
    nameLabel: string
    nameHint: string
    nameSaved: string
    passwordTitle: string
    newPassword: string
    confirmPassword: string
    passwordHint: string
    passwordsNoMatch: string
    passwordTooShort: string
    passwordSaved: string
    prefsTitle: string
    languageLabel: string
    languageNote: string
    save: string
    saving: string
    genericError: string
  }
  tour: {
    button: string
    next: string
    back: string
    skip: string
    done: string
    welcomeTitle: string
    welcomeBody: string
    navTitle: string
    navBody: string
    bellTitle: string
    bellBody: string
    assistantTitle: string
    assistantBody: string
    languageTitle: string
    languageBody: string
    tourBtnTitle: string
    tourBtnBody: string
    modeToggleTitle: string
    modeToggleBody: string
    skillFilterTitle: string
    skillFilterBody: string
    mapTitle: string
    mapBody: string
    engIntroTitle: string
    engIntroBody: string
    engFiltersTitle: string
    engFiltersBody: string
    engBoardTitle: string
    engBoardBody: string
    calIntroTitle: string
    calIntroBody: string
    calToolbarTitle: string
    calToolbarBody: string
    repIntroTitle: string
    repIntroBody: string
    repFiltersTitle: string
    repFiltersBody: string
    repExportTitle: string
    repExportBody: string
    repClassifyTitle: string
    repClassifyBody: string
    talIntroTitle: string
    talIntroBody: string
    talPanelTitle: string
    talPanelBody: string
    talDotsTitle: string
    talDotsBody: string
    talTransferTitle: string
    talTransferBody: string
    fbIntroTitle: string
    fbIntroBody: string
    fbTilesTitle: string
    fbTilesBody: string
    setIntroTitle: string
    setIntroBody: string
    setNameTitle: string
    setNameBody: string
    setPasswordTitle: string
    setPasswordBody: string
    adminNavTitle: string
    adminNavBody: string
    doneTitle: string
    doneBody: string
  }
  feedback: {
    title: string
    intro: string
    programmeLabel: string
    venueLabel: string
    datesLabel: string
    deadlineNote: string
    ratingContent: string
    ratingMaterials: string
    ratingVenue: string
    ratingCommunication: string
    ratingOverall: string
    starLabel: string
    wouldRecommendLabel: string
    yes: string
    no: string
    commentsLabel: string
    commentsHint: string
    commentsPlaceholder: string
    fieldRequired: string
    submitBtn: string
    submitting: string
    retryHint: string
    successTitle: string
    successMessage: string
    alreadySubmittedTitle: string
    alreadySubmittedMessage: string
    expiredTitle: string
    expiredMessage: string
    invalidTitle: string
    invalidMessage: string
  }
  trainerFeedback: {
    title: string
    subtitleAdmin: string
    subtitleUser: string
    migrationBanner: string
    allWorkshops: string
    workshopsShown: string
    untitled: string
    tileResponses: string
    tileResponsesSub: string
    tileAvgOverall: string
    tileAvgOverallSub: string
    tileRecommendPct: string
    tileResponseRate: string
    tileResponseRateSub: string
    noWorkshopsTitle: string
    noWorkshopsDesc: string
    noFeedbackYetTitle: string
    noFeedbackYetDesc: string
    responsesOf: string
    catContent: string
    catMaterials: string
    catVenue: string
    catCommunication: string
    catOverall: string
    recommendTitle: string
    recommendYes: string
    recommendNo: string
    commentsHeading: string
    noComments: string
    anonymousTrainer: string
    footnote: string
  }
  admin: {
    usersTitle: string
    usersSubtitle: string
    pendingUsers: string
    activeUsers: string
    allUsers: string
    approve: string
    suspend: string
    changeRole: string
    role: string
    status: string
    district: string
    email: string
    name: string
    joinedAt: string
    noPending: string
    approveModal: string
    approveDescription: string
    districtLabel: string
    statewideOption: string
    roleAdmin: string
    roleUser: string
    lastAdminError: string
    districtRequiredError: string
    mfaNote: string
    mfaInstructions: string
    addUser: string
    addUserModalTitle: string
    addUserDescription: string
    addUserButton: string
    addUserSuccess: string
    reactivate: string
    deleteUser: string
    deleteConfirm: string
  }
  backlog: {
    myEngagements: string
    allActivity: string
    subtitle: string
    statAll: string
    statusDraft: string
    statusPendingInvite: string
    statusConfirmed: string
    statusDeclined: string
    statusCancelled: string
    tabWorkshops: string
    tabAuditLog: string
    searchPlaceholder: string
    trainingFrom: string
    toWord: string
    shownOfTotal: string
    clearAll: string
    thRef: string
    thWorkshopVenue: string
    thDates: string
    thProgress: string
    thStatus: string
    thBy: string
    thDistrict: string
    thWhen: string
    thActions: string
    thTrainer: string
    thInvite: string
    thInvited: string
    thActor: string
    thAction: string
    thEntity: string
    thDetails: string
    untitled: string
    noWorkshopsMatch: string
    noTrainersInvited: string
    noAuditEntries: string
    cancelWorkshop: string
    reinvite: string
    confirm: string
    withdraw: string
    confirmTrainerPrompt: string
    withdrawReasonPrompt: string
    cancelWorkshopReasonPrompt: string
    reinviteEmailNotDelivered: string
    actionFailed: string
    inviteAccepted: string
    inviteDeclined: string
    tokenExpired: string
    awaiting: string
    expAbbrev: string
    auditTrainerPrefix: string
    auditToPrefix: string
    auditRolePrefix: string
    auditStatusPrefix: string
    auditScopePrefix: string
    auditReasonPrefix: string
    auditNotePrefix: string
    auditViaPrefix: string
    auditWasPrefix: string
    justNow: string
    minutesAgoSuffix: string
    hoursAgoSuffix: string
    daysAgoSuffix: string
    footerNote: string
  }
}

export const en: Translations = {
  common: {
    appName: 'GeoAI Talent Agent',
    tagline: 'Sarawak State Education Department · ICT Unit',
    language: 'Language',
    english: 'English',
    malay: 'Bahasa Melayu',
    loading: 'Loading…',
    error: 'Error',
    success: 'Success',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    back: 'Back',
    signOut: 'Sign out',
    adminBadge: 'Admin',
    mainNavigation: 'Main navigation',
    toggleNav: 'Toggle navigation',
  },
  lexi: {
    title: 'Lexi',
    greeting: 'Hi, I\'m Lexi — I can find trainers, check schedules, explain how this system works, and answer general questions. Try one of these, or ask me anything:',
    inputPlaceholder: 'Ask Lexi…',
    send: 'Send',
    thinking: 'Lexi is thinking…',
    generalKnowledgeLabel: 'General knowledge — not from system data',
    errorMessage: 'Sorry, I couldn\'t process that right now. Please try again.',
    clearChat: 'Clear conversation',
    suggestionsLabel: 'Suggestions',
    chipFindTrainers: 'How many trainers know Scratch in Kuching?',
    chipAvailability: 'Is [trainer name] free on 14–16 July?',
    chipHistory: 'Show [trainer name]\'s engagement and travel history',
    chipOpenCalendar: 'Open the workshop calendar',
    chipOpenEngagements: 'Open my engagements',
    chipHowCost: 'How is travel cost calculated?',
    chipWhatIsModeB: 'What is Mode B and how do I use it?',
  },
  notif: {
    title: 'Notifications',
    empty: 'No notifications yet.',
    markAllRead: 'Mark all as read',
    openAria: 'Open notifications',
  },
  landing: {
    heroDescription:
      'Intelligently map teacher expertise across Sarawak and recommend the right Master Trainers for every training engagement.',
    featureMap: 'Interactive map',
    featureMatching: 'Smart matching',
    featureCost: 'Cost estimates',
    featureSecure: 'Secure & audited',
    footerText: 'Jabatan Pendidikan Negeri Sarawak · PRESTIJ Programme',
  },
  auth: {
    heroBadge: 'JPN Sarawak · ICT Unit',
    heroTitle: 'Geospatial Master Trainer Recommendation Platform',
    chipTravel: 'Travel estimates',
    chipBilingual: 'Bilingual',
    heroFooter: 'Ministry of Education Malaysia · Sarawak State Education Department',
    loginTitle: 'Welcome back',
    loginSubtitle: 'Sign in to your account to continue.',
    registerTitle: 'Create account',
    registerSubtitle: 'Request access to the GeoAI Talent Agent platform.',
    forgotPassword: 'Forgot password?',
    resetPasswordTitle: 'Reset password',
    resetPasswordSubtitle: "Enter your email and we'll send you a reset link.",
    resetPasswordSent: 'Check your email for the password reset link.',
    updatePasswordTitle: 'Set new password',
    updatePasswordSubtitle: 'Enter a new password for your account.',
    emailLabel: 'Email address',
    passwordLabel: 'Password',
    newPasswordLabel: 'New password',
    confirmPasswordLabel: 'Confirm new password',
    fullNameLabel: 'Full name',
    signIn: 'Sign in',
    register: 'Request access',
    sendResetLink: 'Send reset link',
    updatePassword: 'Update password',
    noAccount: "Don't have an account?",
    haveAccount: 'Already have an account?',
    backToLogin: 'Back to sign in',
    emailNotAllowed:
      'This email address is not permitted to register. Please use your official MOE email address or contact an administrator.',
    checkEmail: 'Please check your email to verify your account before signing in.',
    passwordsNoMatch: 'Passwords do not match.',
    passwordTooShort: 'Password must be at least 8 characters.',
    emailInvalid: 'Please enter a valid email address.',
    domainHint: 'Use your official @moe.gov.my email, or contact an administrator.',
    districtLabel: 'Your district',
    districtPlaceholder: '— Select your district —',
    districtHint: "Sets where your map view starts — you'll still be able to see every district.",
    statewideOption: 'Statewide (start with the full map view)',
    districtRequiredError: 'Please select your district.',
  },
  approval: {
    title: 'Account pending approval',
    message:
      'Your account has been created and is awaiting administrator approval. You will be notified by email once your account has been approved.',
    contactAdmin: 'If you need urgent access, please contact your PPD or JPN administrator.',
    signOut: 'Sign out',
  },
  dashboard: {
    title: 'Dashboard',
    welcome: 'Welcome,',
    subtitle: 'GeoAI Talent Agent — Geospatial Master Trainer Recommendation Platform',
    comingSoon: 'The map dashboard will be available in the next phase.',
  },
  map: {
    heatmap: 'Trainer Heatmap',
    allSkillsSubjects: 'All Skills & Subjects',
    skillsGroup: 'ICT Skills',
    subjectsGroup: 'Teaching Subjects',
    searchRadius: 'Search Radius',
    kmUnit: 'km',
    dropPin: 'Drop pin',
    clearCentre: 'Clear',
    useMyLocation: 'My location',
    statewideView: 'Statewide',
    myDistrict: 'My district',
    trainersFound: 'trainers',
    noTrainersFound: 'No trainers in this area',
    loadingMap: 'Loading map…',
    pinInstruction: 'Click map to set search centre',
    radiusLabel: 'Radius',
    modeA: 'Explore',
    modeB: 'Venue',
    navDashboard: 'Dashboard',
    navSearch: 'Search',
    navEngagements: 'Engagements',
    navAdmin: 'Admin',
    navDatabase: 'Database',
    navAnalytics: 'Analytics',
    navAudit: 'Audit Log',
    navReports: 'Reports',
    navTalent: 'Talent Distribution',
    navTrainerFeedback: 'Trainer Feedback',
    navCalendar: 'Calendar',
    navSettings: 'Settings',
    assistant: 'Assistant',
    collapseNav: 'Collapse',
    expandNav: 'Expand',
    openAssistant: 'Open assistant',
    closeAssistant: 'Close assistant',
    assistantComingSoon: 'Your AI assistant will be available in an upcoming phase.',
    distributionView: 'Distribution view',
    zoomOutOverview: 'Zoom out for overview',
    clickToExplore: 'Select a PPD district pin to explore trainers nearby',
    modeALabel: 'Explore',
    modeBLabel: 'Find Trainers',
    venueLabel: 'Workshop Venue',
    venuePlaceholder: 'Search venue name or address…',
    clearVenue: 'Clear venue',
    dropVenuePin: 'Drop venue pin on map',
    filterBySkill: 'Filter by skill / subject',
    venueNotSet: 'Search or drop a pin to set the venue',
    customLocation: 'Custom location',
    registryBadge: 'R',
    geocodeBadge: 'G',
    startDate: 'Start date',
    endDate: 'End date',
    trainingTitle: 'Training title (optional)',
    findAvailableTrainers: 'Find Available Trainers',
    findingTrainers: 'Searching…',
    recommendations: 'Recommendations',
    rankLabel: '#',
    distanceLabel: 'Distance',
    durationLabel: 'Drive',
    transportLabel: 'Transport',
    estimatedCost: 'Est. cost',
    costRoundTrip: 'round trip',
    costSourceFormula: 'Formula',
    costSourceEstimate: 'Estimate',
    noAvailableTrainers: 'No available trainers found for these dates',
    setDatesToSearch: 'Set training dates to find available trainers',
    engagementRef: 'Engagement',
    trainersNeeded: 'Trainers needed',
  },
  batchInvite: {
    selectTrainers: 'Select trainers to invite',
    selectedLabel: 'selected',
    finalizeAndInviteSelected: 'Finalize & Invite Selected',
    reviewModalTitle: 'Review invitation email',
    subjectLabel: 'Subject',
    bodyLabel: 'Message',
    mergeFieldsHint: 'Use {{trainer_name}} to personalize the greeting — the training details card and Accept/Decline buttons are added automatically below your message.',
    previewAsLabel: 'Preview as',
    previewLinkNote: 'Accept/decline links are generated per trainer at send time',
    sendToAll: 'Send to all',
    sending: 'Sending…',
    sendResultsTitle: 'Send results',
    sendSuccessOne: 'Sent',
    sendFailedOne: 'Failed',
    sentNoEmail: 'Invitation recorded — email was NOT delivered (send failed or no provider — check the network/SMTP settings, then use Re-invite)',
    retryFailed: 'Retry failed',
    done: 'Done',
    invitedTrainersLabel: 'Invited trainers',
    refreshStatus: 'Refresh',
  },
  calendar: {
    title: 'Workshop calendar',
    subtitle: 'All scheduled workshops at a glance — confirmed dates lock a trainer out of overlapping searches automatically.',
    subtitleUser: 'Your scheduled workshops at a glance — confirmed dates lock a trainer out of overlapping searches automatically.',
    today: 'Today',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    trainerFilterPlaceholder: 'Filter by trainer name…',
    clearFilter: 'Clear',
    noEngagements: 'No workshops in this month.',
    untitled: 'Untitled workshop',
    venueLabel: 'Venue',
    datesLabel: 'Dates',
    statusLabel: 'Status',
    confirmedWord: 'confirmed',
    trainersLabel: 'Invited trainers',
    noTrainersYet: 'No trainers invited yet.',
    openBacklog: 'Open in Engagements',
    close: 'Close',
    showDrafts: 'Show drafts',
    editWorkshop: 'Edit workshop',
    titleFieldLabel: 'Workshop title',
    startLabel: 'Start date',
    endLabel: 'End date',
    saving: 'Saving…',
    rescheduleNote: 'Changing the dates will reset invited and accepted trainers to Pending and re-send invitations with the new dates.',
    rescheduleConfirm: 'Change the dates of this workshop? All invited and accepted trainers will be reset to Pending, their old links invalidated, and a date-change email with new confirmation links will be sent to each of them.',
    rescheduleResultTitle: 'Dates updated — re-confirmation requests sent',
    rescheduleEmailOk: 'email sent',
    rescheduleEmailFailed: 'email NOT delivered',
    rescheduleNoTrainers: 'No invited trainers to notify — dates updated.',
    cancelWorkshop: 'Cancel workshop',
    cancelConfirm: 'Cancel this workshop? All outstanding invitation links will be invalidated. This keeps the history but cannot be re-opened.',
    deleteDraft: 'Delete draft',
    deleteConfirm: 'Permanently delete this draft workshop? Nothing was sent to trainers. This cannot be undone.',
  },
  adminDb: {
    title: 'Database console',
    subtitle: 'View, add, edit or remove reference data directly. Changes are live and audited — engagement and account records are managed on their own pages.',
    searchPlaceholder: 'Search',
    totalRows: 'Total rows',
    addRow: 'Add row',
    editRow: 'Edit',
    deleteRow: 'Delete',
    deleteConfirm: 'Delete this row permanently? This cannot be undone.',
    softDeleteConfirm: 'Delete this row? It will be hidden from the app but can be restored from the Deleted rows view.',
    deletedToggle: 'Deleted rows',
    deletedAtCol: 'Deleted',
    restoreRow: 'Restore',
    restoreConfirm: 'Restore this row? It will reappear everywhere in the app.',
    actionsCol: 'Actions',
    noRows: 'No rows found.',
    save: 'Save',
    savingLabel: 'Saving…',
    prevPage: 'Prev',
    nextPage: 'Next',
  },
  audit: {
    title: 'Audit log',
    subtitle: 'Every sensitive action recorded by the system — latest 500 entries. Click a row to see the full recorded detail.',
    searchPlaceholder: 'Search actor, action, entity or detail…',
    allActions: 'All actions',
    fromDate: 'From',
    toDate: 'To',
    shownSuffix: 'shown',
    clearFilters: 'Clear filters',
    thWhen: 'When',
    thActor: 'Actor',
    thAction: 'Action',
    thEntity: 'Entity',
    thDetails: 'Details',
    noRows: 'No audit entries match.',
    systemActor: 'System',
  },
  analytics: {
    title: 'Analytics & KPIs',
    subtitle: 'Programme KPIs computed live from system data. All figures are deterministic — nothing here is estimated by AI.',
    noData: 'No data yet.',
    tileTrainers: 'Active trainers',
    tileWorkshops: 'Workshops',
    tileConfirmedSuffix: 'confirmed',
    tileInvites: 'Invitations sent',
    tileAcceptRate: 'Accept rate',
    tileDistricts: 'Districts covered',
    tileDesertsSuffix: 'talent deserts',
    adoptTitle: 'Recommendation adoption',
    adoptSubtitle: 'Outcome of every trainer invitation sent through the system.',
    adoptConfirmed: 'Accepted',
    adoptPending: 'Awaiting reply',
    adoptDeclined: 'Declined',
    adoptAcceptRate: 'Accept rate (of responses)',
    adoptStaffed: 'Workshops fully staffed',
    adoptStaffedSub: 'of workshops with invitations sent',
    overlapTitle: 'Double-booking check',
    overlapSubtitle: 'Confirmed bookings on overlapping dates for the same trainer.',
    overlapNone: 'No overlapping confirmed bookings.',
    overlapFound: 'Overlapping confirmed bookings found — review the calendar.',
    overlapNote: 'The availability search excludes trainers with clashing confirmed or pending engagements by construction, so this figure should stay at zero. Checked across {n} trainers with confirmed bookings.',
    costTitle: 'Cost-estimate accuracy',
    costSubtitle: 'Estimated travel cost vs the actual claimed cost, for confirmed trainer bookings. Enter actuals as claims come in. Download the report to prepare a workshop budget.',
    costFilterLabel: 'Workshop / programme',
    costFilterAll: 'All workshops',
    costDownloadCsv: 'Download CSV',
    costDownloadPdf: 'Download PDF',
    costAccuracy: 'Within ±20%',
    costAccuracySub: 'KPI target: 80%',
    costMae: 'Mean abs. error',
    costWithActuals: 'Actuals recorded',
    costTotalEstimated: 'Total estimated',
    costThEngagement: 'Workshop',
    costThTrainer: 'Trainer',
    costThMode: 'Mode',
    costThEstimated: 'Estimated',
    costThActual: 'Actual (RM)',
    costThVariance: 'Variance',
    costEnterActual: 'RM…',
    costSave: 'Save',
    costInvalidNumber: 'Enter a valid non-negative amount.',
    costNoRows: 'No confirmed bookings with travel estimates yet.',
    costNote: 'Actual costs are entered manually from finance claims; every entry is audit-logged. Estimates remain estimates — verify with the finance officer before committing expenditure.',
    covTitle: 'Talent coverage by district',
    covSubtitle: 'Active Master Trainers per PPD district. Districts with fewer than {n} trainers are flagged as talent deserts.',
    covDesertBadge: 'desert',
    covNoTrainers: 'none',
  },
  reports: {
    title: 'Reports',
    subtitleAdmin: 'Workshop, invitation and travel-cost report across all districts. Figures are computed live from system data.',
    subtitleUser: 'Workshop, invitation and travel-cost report for the workshops you created. Figures are computed live from system data.',
    migrationBanner: 'Fit classification is unavailable — database migration 025 has not been applied yet. The report still works without it.',
    searchPlaceholder: 'Search workshop, venue, trainer…',
    fromDate: 'From',
    toDate: 'To',
    allDistricts: 'All districts',
    allWorkshops: 'All workshops',
    allStatuses: 'All statuses',
    allResponses: 'All responses',
    exportCsv: 'Export CSV',
    noWorkshops: 'No workshops match your filters.',
    noTrainers: 'No trainers invited yet.',
    untitled: 'Untitled',
    footnote: 'Costs shown are estimates computed by the system — verify with the finance officer before committing expenditure. CSV export is audit-logged.',
    chipWorkshops: 'Workshops',
    chipInvited: 'Invited',
    chipAccepted: 'Accepted',
    chipPending: 'Pending',
    chipDeclined: 'Declined',
    chipEstCost: 'Est. cost (confirmed)',
    thWorkshop: 'Workshop',
    thDates: 'Dates',
    thDistrict: 'District',
    thStatus: 'Status',
    thInvited: 'Invited',
    thAccepted: 'Accepted',
    thPending: 'Pending',
    thDeclined: 'Declined',
    thEstCost: 'Est. cost',
    costInvitedPrefix: 'all invited:',
    thTrainer: 'Trainer',
    thTrainerDistrict: 'District',
    thResponse: 'Response',
    thResponded: 'Responded',
    thDistance: 'Distance',
    thEstCostT: 'Est. cost',
    thActualCost: 'Actual cost',
    thClassification: 'Classification',
    aiSuggestBtn: 'AI suggestions',
    aiSuggesting: 'Suggesting…',
    aiSuggestionPrefix: 'AI suggestion',
    aiDisclaimer: 'AI suggestions are advisory only — the final decision is always made by a person.',
    approveBtn: 'Approve',
    overrideLabel: 'Set classification…',
    decidedLabel: 'approved',
    stDraft: 'Draft',
    stPendingInvite: 'Pending Invite',
    stConfirmed: 'Confirmed',
    stDeclined: 'Declined',
    stCancelled: 'Cancelled',
    clsSuitable: 'Suitable',
    clsPendingReview: 'Pending review',
    clsNotMatched: 'Not matched',
    clsConfirmed: 'Confirmed',
    clsDeclined: 'Declined',
  },
  talent: {
    title: 'Talent Distribution',
    subtitle: 'Where trainer expertise is concentrated — and where it is missing.',
    searchPlaceholder: 'Trainer name or ID…',
    allDistricts: 'All districts',
    dateFrom: 'From',
    dateTo: 'To',
    availAll: 'All trainers',
    availAvailable: 'Available in range',
    availEngaged: 'Engaged in range',
    radiusTitle: 'Centre & radius',
    dropCentre: 'Drop a centre point',
    dropCentreActive: 'Click the map to set the centre…',
    clearCentre: 'Clear',
    trainersShown: 'Trainers',
    districtsCovered: 'Districts covered',
    desertsChip: 'Talent deserts',
    congestedChip: 'Congested',
    legendTitle: 'District coverage',
    pinLegendTitle: 'Pin colour = PPD district',
    insightsHint: 'Each dot is a district — its colour shows how well it is covered by trainers for the current filters. Hover a dot to see the number of trainers.',
    legendNone: 'No trainers here',
    legendLow: 'Very few trainers',
    legendHigh: 'Highly concentrated',
    legendNormal: 'Well covered',
    desertsTitle: 'Talent deserts',
    congestedTitle: 'Talent congestion',
    noneFlagged: 'None for the current filter.',
    trainerPanelTitle: 'Selected trainer',
    school: 'Workstation',
    district: 'District',
    coordinates: 'Coordinates',
    roles: 'Roles',
    skills: 'Skills',
    subjects: 'Subjects',
    noSchool: 'No registry school linked',
    clearSelection: 'Clear selection',
    zoomHint: 'Zoom in or select a district badge to see individual trainers.',
    transferBtn: 'Update workstation (transfer)',
    transferTitle: 'Transfer workstation',
    transferIntro: 'Set the new workstation for {name}. Pick a registry school, search a place, or drop a pin on the map.',
    transferSearchLabel: 'Search school registry or place name',
    transferOr: 'or',
    transferPinBtn: 'Drop a pin on the map',
    transferPinHint: 'Click the map at the new workstation location…',
    transferPinCancel: 'Cancel pin drop',
    currentLabel: 'Current',
    newLabel: 'New',
    districtChangeNote: 'District will update to the school\'s PPD district.',
    keepDistrictNote: 'District stays unchanged (arbitrary location).',
    confirmBtn: 'Confirm transfer',
    confirming: 'Transferring…',
    cancelBtn: 'Cancel',
    transferFailed: 'Transfer failed',
    auditNote: 'This change is written to the audit log.',
    loading: 'Loading trainers…',
  },
  invitationResponse: {
    acceptedTitle: 'Invitation accepted',
    acceptedMessage: 'Thank you — your participation has been confirmed. The training coordinator has been notified.',
    declinedTitle: 'Invitation declined',
    declinedMessage: 'Your response has been recorded. Thank you for letting us know.',
    expiredTitle: 'Link expired',
    expiredMessage: 'This invitation link has expired. Please contact the training coordinator for assistance.',
    alreadyUsedTitle: 'Already responded',
    alreadyUsedMessage: 'This invitation has already been responded to.',
    invalidTitle: 'Invalid link',
    invalidMessage: 'This invitation link is invalid. Please contact the training coordinator for assistance.',
    confirmAcceptTitle: 'Confirm your acceptance',
    confirmDeclineTitle: 'Confirm your decline',
    confirmAcceptMessage: 'You are about to ACCEPT the invitation for the programme below. Press the button to confirm.',
    confirmDeclineMessage: 'You are about to DECLINE the invitation for the programme below. Press the button to confirm.',
    confirmAcceptBtn: '✔ Confirm — Accept invitation',
    confirmDeclineBtn: '✘ Confirm — Decline invitation',
    confirmSubmitting: 'Recording your response…',
    confirmNote: 'Nothing is recorded until you press the button above.',
    closeNote: 'You may now close this page.',
    labelProgramme: 'Programme',
    labelVenue: 'Venue',
    labelDates: 'Dates',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Your account and preferences.',
    profileTitle: 'My account',
    emailLabel: 'Email',
    roleLabel: 'Role',
    roleAdmin: 'Administrator',
    roleUser: 'Standard user',
    districtLabel: 'PPD district',
    statewide: 'Statewide',
    nameTitle: 'Display name',
    nameLabel: 'Full name',
    nameHint: 'Shown in audit logs and notifications.',
    nameSaved: 'Display name updated.',
    passwordTitle: 'Change password',
    newPassword: 'New password',
    confirmPassword: 'Confirm new password',
    passwordHint: 'At least 8 characters.',
    passwordsNoMatch: 'Passwords do not match.',
    passwordTooShort: 'Password must be at least 8 characters.',
    passwordSaved: 'Password changed successfully.',
    prefsTitle: 'Preferences',
    languageLabel: 'Language',
    languageNote: 'Applies immediately across the app and is remembered on this browser.',
    save: 'Save',
    saving: 'Saving…',
    genericError: 'Something went wrong. Please try again.',
  },
  tour: {
    button: 'Tour',
    next: 'Next',
    back: 'Back',
    skip: 'Skip tour',
    done: 'Done',
    welcomeTitle: 'Welcome to GeoAI Talent Agent',
    welcomeBody: 'This short tour walks you through the main screens — where trainer expertise lives on the map, how invitations work, and where to find reports. Use Next to continue, or skip anytime.',
    navTitle: 'Navigation rail',
    navBody: 'Every screen lives here: Dashboard, Search, Engagements, Calendar, Reports, Talent Distribution, Trainer Feedback — and Settings at the bottom. Click the arrow at the bottom to expand the labels.',
    bellTitle: 'Notifications',
    bellBody: 'The bell lights up when a trainer accepts or declines one of your invitations, or when a new account awaits approval (admins).',
    assistantTitle: 'Lexi — your assistant',
    assistantBody: 'Ask Lexi things like "how many ICT trainers are in Kuching?" or "is trainer X available in August?" — answers come from live system data, and Lexi can take you to the right screen.',
    languageTitle: 'Language',
    languageBody: 'Switch the whole app between English and Bahasa Melayu at any time. Your choice is remembered on this browser.',
    tourBtnTitle: 'This tour',
    tourBtnBody: 'You can re-run this walkthrough anytime from the Tour button.',
    modeToggleTitle: 'Two ways to explore',
    modeToggleBody: 'Mode A shows where trainer expertise is concentrated statewide. Mode B starts from a training venue — pick a place and get ranked trainer recommendations within a travel radius.',
    skillFilterTitle: 'Filter by skill or subject',
    skillFilterBody: 'Tick any combination of skills and subjects — the map reshapes to show only trainers holding ALL of them.',
    mapTitle: 'The live map',
    mapBody: 'The heat glow shows trainer density. Zoom in (or click a district pin) and it switches to individual trainer pins — click a pin for the full profile with travel-cost estimates in Mode B.',
    engIntroTitle: 'Engagements board',
    engIntroBody: 'Every workshop you create is tracked here — who was invited, who accepted or declined, and the overall status rollup.',
    engFiltersTitle: 'Search and filter',
    engFiltersBody: 'Find any workshop by text, date range, or status. Admins see all workshops; you always see your own.',
    engBoardTitle: 'Workshop groups',
    engBoardBody: 'Each workshop expands to show its invited trainers with an X/Y confirmed progress bar. From here you can re-invite, manually confirm, or cancel.',
    calIntroTitle: 'Workshop Calendar',
    calIntroBody: 'Your scheduled workshops on a monthly grid. Rescheduling an invited workshop resets trainer confirmations and sends fresh accept/decline emails automatically.',
    calToolbarTitle: 'Calendar controls',
    calToolbarBody: 'Move between months, jump to today, search by trainer, and toggle draft workshops on or off.',
    repIntroTitle: 'Reports',
    repIntroBody: 'Per-workshop invitation outcomes and travel-cost summaries, with per-trainer detail underneath each row.',
    repFiltersTitle: 'Report filters',
    repFiltersBody: 'Narrow by text, workshop, date range, or status — the summary chips and the CSV export always match exactly what you see.',
    repExportTitle: 'CSV export',
    repExportBody: 'Download the filtered report as a CSV that opens cleanly in Excel — one row per invited trainer.',
    repClassifyTitle: '✦ AI fit classification',
    repClassifyBody: 'For trainers who have not responded yet, the AI can suggest a fit label with a bilingual reason. Suggestions are advisory only — a person always approves the final classification.',
    talIntroTitle: 'Talent Distribution',
    talIntroBody: 'The statewide view of where expertise is concentrated — and where it is missing.',
    talPanelTitle: 'Filters and legends',
    talPanelBody: 'Filter by skill, district, name, radius, or date-range availability. Click a trainer pin and their profile appears at the top of this panel.',
    talDotsTitle: 'Talent deserts and congestion',
    talDotsBody: 'Each district is a coloured dot: a hollow red ring means no matching trainers, amber means very few, green is well covered, navy is highly concentrated. Hover a dot for the exact count — tick a skill and watch the picture change.',
    talTransferTitle: 'Workstation transfer (admin)',
    talTransferBody: 'Select a trainer, then use "Update workstation" to move them to a registry school, a geocoded place, or a dropped pin — every transfer is audit-logged.',
    fbIntroTitle: 'Trainer Feedback',
    fbIntroBody: 'After a workshop ends, trainers automatically receive a feedback form by email. Their ratings and comments land here.',
    fbTilesTitle: 'Feedback at a glance',
    fbTilesBody: 'Response rate, average overall rating, and recommend percentage — filter by workshop to drill into one programme.',
    setIntroTitle: 'Settings',
    setIntroBody: 'Your account details and preferences.',
    setNameTitle: 'Display name',
    setNameBody: 'The name shown in audit logs and notifications — edit it here anytime.',
    setPasswordTitle: 'Change password',
    setPasswordBody: 'Set a new password (minimum 8 characters). It takes effect immediately.',
    adminNavTitle: 'Admin screens',
    adminNavBody: 'As an administrator you also have: User Management (approvals, roles), the Database console (reference data), Analytics (KPIs and cost accuracy), and the Audit Log (every sensitive action).',
    doneTitle: 'You are all set',
    doneBody: 'That is the whole system. Re-run this walkthrough anytime with the Tour button, or ask Lexi if you get stuck. Selamat maju jaya!',
  },
  feedback: {
    title: 'Workshop feedback',
    intro: 'Dear {name}, thank you for serving as Master Trainer. Please share your experience of the workshop below — it takes just a few minutes.',
    programmeLabel: 'Programme',
    venueLabel: 'Venue',
    datesLabel: 'Dates',
    deadlineNote: 'Please submit this form by {date}.',
    ratingContent: 'Content relevance',
    ratingMaterials: 'Materials & resources provided',
    ratingVenue: 'Venue & logistics',
    ratingCommunication: 'Organizer communication',
    ratingOverall: 'Overall satisfaction',
    starLabel: 'Rate {n} out of 5',
    wouldRecommendLabel: 'Would you recommend this programme to other trainers?',
    yes: 'Yes',
    no: 'No',
    commentsLabel: 'Comments & suggestions',
    commentsHint: 'Optional',
    commentsPlaceholder: 'Anything that went well, or could be improved…',
    fieldRequired: 'Please select a rating.',
    submitBtn: 'Submit feedback',
    submitting: 'Submitting…',
    retryHint: 'please try again.',
    successTitle: 'Feedback submitted',
    successMessage: 'Thank you — your feedback has been recorded. It helps us improve future workshops.',
    alreadySubmittedTitle: 'Already submitted',
    alreadySubmittedMessage: 'Feedback for this workshop has already been submitted. Thank you!',
    expiredTitle: 'Link expired',
    expiredMessage: 'This feedback link has expired. Please contact the programme coordinator if you would still like to share feedback.',
    invalidTitle: 'Invalid link',
    invalidMessage: 'This feedback link is invalid. Please contact the programme coordinator for assistance.',
  },
  trainerFeedback: {
    title: 'Trainer Feedback',
    subtitleAdmin: 'Post-workshop feedback from Master Trainers across all workshops. Requests are emailed automatically once a workshop completes.',
    subtitleUser: 'Post-workshop feedback from Master Trainers for the workshops you created. Requests are emailed automatically once a workshop completes.',
    migrationBanner: 'Feedback data is unavailable — database migration 027 has not been applied yet.',
    allWorkshops: 'All workshops',
    workshopsShown: '{n} workshop(s)',
    untitled: 'Untitled',
    tileResponses: 'Responses received',
    tileResponsesSub: 'of {n} requests sent',
    tileAvgOverall: 'Avg. overall rating',
    tileAvgOverallSub: 'out of 5',
    tileRecommendPct: 'Would recommend',
    tileResponseRate: 'Response rate',
    tileResponseRateSub: 'responses ÷ requests sent',
    noWorkshopsTitle: 'No workshops with confirmed trainers yet',
    noWorkshopsDesc: 'Feedback is collected from confirmed trainers after a workshop completes.',
    noFeedbackYetTitle: 'No feedback submitted yet',
    noFeedbackYetDesc: 'Feedback requests are emailed automatically the day after a workshop ends. Responses will appear here.',
    responsesOf: '{received} of {requested} responses',
    catContent: 'Content relevance',
    catMaterials: 'Materials & resources',
    catVenue: 'Venue & logistics',
    catCommunication: 'Organizer communication',
    catOverall: 'Overall satisfaction',
    recommendTitle: 'Would recommend',
    recommendYes: 'Yes',
    recommendNo: 'No',
    commentsHeading: 'Comments',
    noComments: 'No written comments yet.',
    anonymousTrainer: 'Trainer',
    footnote: 'Ratings are averages of submitted trainer feedback. Requests are sent automatically 1 day after a workshop\'s end date, with a 14-day deadline to respond.',
  },
  admin: {
    usersTitle: 'User management',
    usersSubtitle: 'Approve pending accounts and manage user roles.',
    pendingUsers: 'Pending approval',
    activeUsers: 'Active users',
    allUsers: 'All users',
    approve: 'Approve',
    suspend: 'Suspend',
    changeRole: 'Change role',
    role: 'Role',
    status: 'Status',
    district: 'District',
    email: 'Email',
    name: 'Name',
    joinedAt: 'Joined',
    noPending: 'No pending accounts.',
    approveModal: 'Approve account',
    approveDescription: 'Set the role and district for this user.',
    districtLabel: 'Assign district',
    statewideOption: 'Statewide (State Officer — read-only, all districts)',
    roleAdmin: 'Administrator (JPN)',
    roleUser: 'Standard user (PPD / School)',
    lastAdminError: 'Cannot change: this is the last active administrator.',
    districtRequiredError: 'Standard users must be assigned a district — otherwise they won\'t see any trainers on the map.',
    mfaNote: 'Administrator MFA setup',
    mfaInstructions:
      'To enable MFA for admin accounts: go to Supabase Dashboard → Authentication → Policies and enable "Enforce MFA for admin users". Admins can then set up TOTP in their account settings.',
    addUser: '+ Add user',
    addUserModalTitle: 'Add new user',
    addUserDescription: 'Creates the account immediately and emails an invite link where they set their own password.',
    addUserButton: 'Send invite',
    addUserSuccess: 'Invitation sent.',
    reactivate: 'Reactivate',
    deleteUser: 'Delete',
    deleteConfirm: 'Permanently delete this account? This cannot be undone.',
  },
  backlog: {
    myEngagements: 'My Engagements',
    allActivity: 'All Activity',
    subtitle: 'Workshops, trainer invitations, and audit trail.',
    statAll: 'All',
    statusDraft: 'Draft',
    statusPendingInvite: 'Pending Invite',
    statusConfirmed: 'Confirmed',
    statusDeclined: 'Declined',
    statusCancelled: 'Cancelled',
    tabWorkshops: 'Workshops',
    tabAuditLog: 'Audit Log',
    searchPlaceholder: 'Search trainer, title, venue…',
    trainingFrom: 'Training from',
    toWord: 'to',
    shownOfTotal: '{shown} of {total} shown',
    clearAll: 'Clear all',
    thRef: 'Ref',
    thWorkshopVenue: 'Workshop / Venue',
    thDates: 'Dates',
    thProgress: 'Progress',
    thStatus: 'Status',
    thBy: 'By',
    thDistrict: 'District',
    thWhen: 'When',
    thActions: 'Actions',
    thTrainer: 'Trainer',
    thInvite: 'Invite',
    thInvited: 'Invited',
    thActor: 'Actor',
    thAction: 'Action',
    thEntity: 'Entity',
    thDetails: 'Details',
    untitled: 'Untitled',
    noWorkshopsMatch: 'No workshops match your filters.',
    noTrainersInvited: 'No trainers invited yet.',
    noAuditEntries: 'No audit log entries yet.',
    cancelWorkshop: 'Cancel workshop',
    reinvite: 'Re-invite',
    confirm: 'Confirm',
    withdraw: 'Withdraw',
    confirmTrainerPrompt: 'Mark this trainer as Confirmed? This records an off-system confirmation.',
    withdrawReasonPrompt: 'Reason for withdrawing this invite (optional):',
    cancelWorkshopReasonPrompt: 'Reason for cancelling this workshop (optional):',
    reinviteEmailNotDelivered: 'Re-invited, but email NOT delivered',
    actionFailed: 'Failed',
    inviteAccepted: 'Accepted',
    inviteDeclined: 'Declined',
    tokenExpired: 'Token expired',
    awaiting: 'Awaiting',
    expAbbrev: 'exp.',
    auditTrainerPrefix: 'Trainer:',
    auditToPrefix: 'To:',
    auditRolePrefix: 'Role →',
    auditStatusPrefix: 'Status →',
    auditScopePrefix: 'Scope:',
    auditReasonPrefix: 'Reason:',
    auditNotePrefix: 'Note:',
    auditViaPrefix: 'Via:',
    auditWasPrefix: 'Was:',
    justNow: 'just now',
    minutesAgoSuffix: 'm ago',
    hoursAgoSuffix: 'h ago',
    daysAgoSuffix: 'd ago',
    footerNote: 'Showing up to 200 workshops and 100 audit log entries · Sorted newest first',
  },
}
