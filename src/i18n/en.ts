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
  }
  auth: {
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
    navSettings: string
    assistant: string
    collapseNav: string
    expandNav: string
    openAssistant: string
    closeAssistant: string
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
    retryFailed: string
    done: string
    invitedTrainersLabel: string
    refreshStatus: string
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
  }
}

export const en: Translations = {
  common: {
    appName: 'GEO-TALENT AGENT',
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
  },
  auth: {
    loginTitle: 'Welcome back',
    loginSubtitle: 'Sign in to your account to continue.',
    registerTitle: 'Create account',
    registerSubtitle: 'Request access to the GEO-TALENT AGENT platform.',
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
    subtitle: 'GEO-TALENT AGENT — Geospatial Master Trainer Recommendation Platform',
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
    navSettings: 'Settings',
    assistant: 'Assistant',
    collapseNav: 'Collapse',
    expandNav: 'Expand',
    openAssistant: 'Open assistant',
    closeAssistant: 'Close assistant',
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
    retryFailed: 'Retry failed',
    done: 'Done',
    invitedTrainersLabel: 'Invited trainers',
    refreshStatus: 'Refresh',
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
  },
}
