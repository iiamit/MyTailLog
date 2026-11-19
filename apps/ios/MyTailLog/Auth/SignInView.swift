import AuthenticationServices
import SwiftUI

/// M-AUTH-01 (06 §3): the setup board with the wordmark, then a leaf with the ways in:
/// Apple first, Google second, the email link (and code) third, a password one tap away.
/// Passkeys are phase 2 (05 §8.2) and not shown.
struct SignInView: View {
    @Environment(SessionStore.self) private var store
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession

    @State private var step = Step.start
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var sentAt = Date.distantPast
    @State private var resentAt: Date?
    /// Which control started the running request; the others disable while it runs.
    @State private var working: String?
    @State private var error: AuthError?
    @State private var appleNonce = ""
    @FocusState private var focused: Field?

    private enum Field { case name, email, password, code }

    enum Step: Equatable {
        case start
        /// The sign-in (or sign-up confirmation) email went out: a link and a code.
        case code(String)
        case password
        case signUp
        /// The password-reset code went out.
        case reset(String)
    }

    private var busy: Bool { working != nil }
    private var address: String { email.trimmingCharacters(in: .whitespaces).lowercased() }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if !typeSize.isAccessibilitySize {
                    cover.containerRelativeFrame(.vertical) { height, _ in height * 0.46 }
                }
                leaf
            }
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
        .background(alignment: .top) {
            VStack(spacing: 0) { Section.setup.board; Tokens.Colors.leaf }.ignoresSafeArea()
        }
        .environment(\.section, .setup)
        .onChange(of: store.linkNeedsCode) { _, needsCode in
            if needsCode { code = ""; error = nil; focused = .code }
        }
    }

    private var cover: some View {
        ZStack(alignment: .topLeading) {
            Section.setup.board
            VStack(alignment: .leading, spacing: Tokens.Space.s3) {
                Text("MyTailLog")
                    .font(.custom("LibreFranklin-ExtraBold", size: 34, relativeTo: .largeTitle))
                    .foregroundStyle(Section.setup.onBoard)
                    .accessibilityAddTraits(.isHeader)
                Text("Your aircraft's logbooks, photographed and read into an index you can search, with what is due worked out from them.")
                    .dFont(.lede)
                    .foregroundStyle(Section.setup.onBoard2)
                    .lineLimit(3)
            }
            .padding(.leading, Tokens.Space.s6)
            .padding(.trailing, Tokens.Space.s6 + 24)
            .padding(.top, 120)
            // The six section colours as a stack of tabs at the right edge, decorative.
            VStack(spacing: 2) {
                ForEach(Section.tabletTabs) { $0.board }
            }
            .frame(width: 24)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
            .padding(.vertical, Tokens.Space.s6)
            .accessibilityHidden(true)
        }
    }

    private var leaf: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            if let notice = store.notice {
                Text(notice).dFont(.body).foregroundStyle(Tokens.Colors.ink)
            }
            if store.linkNeedsCode {
                linkCodeStep
            } else {
                switch step {
                case .start: startStep
                case .code(let sentTo): codeStep(sentTo)
                case .password: passwordStep
                case .signUp: signUpStep
                case .reset(let sentTo): resetStep(sentTo)
                }
            }
            Text("Free and open source. The paper logbooks stay the record.")
                .dFont(.small)
                .foregroundStyle(Tokens.Colors.ink3)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, Tokens.Space.s5)
        }
        .padding(.top, Tokens.Space.s6)
        .padding(.horizontal, Tokens.Space.s4)
        .padding(.bottom, Tokens.Space.s8)
        .frame(maxWidth: 560)
        .frame(maxWidth: .infinity)
        .background(Tokens.Colors.leaf, in: UnevenRoundedRectangle(topLeadingRadius: Tokens.Radius.s, topTrailingRadius: Tokens.Radius.s))
        .padding(.horizontal, Tokens.Space.s2)
    }

    // MARK: Steps

    @ViewBuilder private var startStep: some View {
        SignInWithAppleButton(.continue) { request in
            appleNonce = AuthFlow.randomToken()
            request.requestedScopes = [.fullName, .email]
            request.nonce = AuthFlow.appleNonceHash(appleNonce)
        } onCompletion: { result in
            finishApple(result)
        }
        .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
        .frame(height: Tokens.Size.phoneButton)
        .disabled(busy)
        .opacity(busy ? 0.4 : 1)

        Button(action: signInWithGoogle) {
            HStack(spacing: Tokens.Space.s2) {
                if working == "google" {
                    ProgressView().controlSize(.small)
                    Text("Signing in")
                } else {
                    // Google's multicolour "G" mark, never tinted (Google branding rules).
                    Image("google-g").resizable().frame(width: 18, height: 18).accessibilityHidden(true)
                    Text("Continue with Google")
                }
            }
        }
        .buttonStyle(.secondary)
        .disabled(busy)

        HStack(spacing: Tokens.Space.s3) {
            rule
            Text("or with your email").dFont(.caption).foregroundStyle(Tokens.Colors.ink3).fixedSize()
            rule
        }
        .padding(.vertical, Tokens.Space.s5)
        .accessibilityElement(children: .combine)

        emailField(submit: sendLink)
        errorLine
        Button(action: sendLink) {
            busyLabel("send", busy: "Sending", idle: "Email me a sign-in link", icon: "mail")
        }
        .buttonStyle(.primary)
        .disabled(busy || !address.contains("@"))
        quiet("Use a password instead") { go(.password) }
    }

    @ViewBuilder private func codeStep(_ sentTo: String) -> some View {
        Text("Check your email").dFont(.heading).foregroundStyle(Tokens.Colors.ink).accessibilityAddTraits(.isHeader)
        Text("We sent a link and a 6-digit code to \(sentTo). Open the link on this phone, or type the code.")
            .dFont(.body).foregroundStyle(Tokens.Colors.ink)
        codeField
        errorLine
        Button { run("verify") { try await store.verify(email: sentTo, code: code) } } label: {
            busyLabel("verify", busy: "Signing in", idle: "Sign in")
        }
        .buttonStyle(.primary)
        .disabled(busy || code.count < 6)
        resendRow { try await store.sendCode(email: sentTo) }
        quiet("Use a different email") { go(.start) }
    }

    /// 05 §8.4: an email link this phone cannot complete. Ask for the code from the same email, not an error.
    @ViewBuilder private var linkCodeStep: some View {
        Text("Enter the 6-digit code from the same email")
            .dFont(.heading).foregroundStyle(Tokens.Colors.ink).accessibilityAddTraits(.isHeader)
        emailField(submit: { focused = .code })
        codeField
        errorLine
        Button { run("verify") { try await store.verify(email: address, code: code) } } label: {
            busyLabel("verify", busy: "Signing in", idle: "Sign in")
        }
        .buttonStyle(.primary)
        .disabled(busy || code.count < 6 || !address.contains("@"))
        quiet("Email me a new link") {
            store.linkNeedsCode = false
            go(.start)
        }
    }

    @ViewBuilder private var passwordStep: some View {
        emailField(submit: { focused = .password })
        passwordField(new: false, submit: signInWithPassword)
        errorLine
        Button(action: signInWithPassword) { busyLabel("password", busy: "Signing in", idle: "Sign in") }
            .buttonStyle(.primary)
            .disabled(busy || !address.contains("@") || password.isEmpty)
        quiet("Create an account") { go(.signUp) }
        quiet("Forgot your password?", action: sendReset)
        quiet("Email me a link instead") { go(.start) }
    }

    @ViewBuilder private var signUpStep: some View {
        label("Your name")
        TextField("", text: $name)
            .textContentType(.name)
            .submitLabel(.next)
            .focused($focused, equals: .name)
            .onSubmit { focused = .email }
            .modifier(DTextInput(focused: focused == .name))
            .accessibilityLabel("Your name")
        emailField(submit: { focused = .password })
        passwordField(new: true, submit: signUp)
        errorLine
        Button(action: signUp) { busyLabel("signup", busy: "Creating your account", idle: "Create an account") }
            .buttonStyle(.primary)
            .disabled(busy || !address.contains("@") || !AuthFlow.isAcceptablePassword(password))
        quiet("I already have an account") { go(.password) }
        quiet("Email me a link instead") { go(.start) }
    }

    @ViewBuilder private func resetStep(_ sentTo: String) -> some View {
        Text("Check your email").dFont(.heading).foregroundStyle(Tokens.Colors.ink).accessibilityAddTraits(.isHeader)
        Text("We sent a 6-digit code to \(sentTo). Type it and choose a new password.")
            .dFont(.body).foregroundStyle(Tokens.Colors.ink)
        codeField
        passwordField(new: true, title: "New password", submit: resetPassword)
        errorLine
        Button(action: resetPassword) { busyLabel("reset", busy: "Signing in", idle: "Set password and sign in") }
            .buttonStyle(.primary)
            .disabled(busy || code.count < 6 || !AuthFlow.isAcceptablePassword(password))
        resendRow { try await store.sendReset(email: sentTo) }
        quiet("Use a different email") { go(.password) }
    }

    // MARK: Fields and pieces

    @ViewBuilder private func emailField(submit: @escaping () -> Void) -> some View {
        label("Email")
        TextField("", text: $email, prompt: Text("you@example.com").foregroundStyle(Tokens.Colors.ink3))
            .textContentType(.username)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.next)
            .focused($focused, equals: .email)
            .onSubmit(submit)
            .modifier(DTextInput(focused: focused == .email))
            .accessibilityLabel("Email")
    }

    @ViewBuilder private func passwordField(new: Bool, title: String = "Password", submit: @escaping () -> Void) -> some View {
        label(title)
        SecureField("", text: $password)
            .textContentType(new ? .newPassword : .password)
            .submitLabel(.go)
            .focused($focused, equals: .password)
            .onSubmit(submit)
            .modifier(DTextInput(focused: focused == .password))
            .accessibilityLabel(title)
        if new {
            // The rule shown inline, an info line (never the alarm colour).
            Text("At least 8 characters").dFont(.small).foregroundStyle(Tokens.Colors.ink3)
        }
    }

    private var codeField: some View {
        TextField("", text: $code)
            .textContentType(.oneTimeCode)
            .keyboardType(.numberPad)
            .font(.custom("LibreFranklin-Bold", size: 22, relativeTo: .title2).monospacedDigit())
            .focused($focused, equals: .code)
            .modifier(DTextInput(focused: focused == .code))
            .accessibilityLabel("6-digit code")
            .onChange(of: code) { _, new in code = String(new.filter(\.isNumber).prefix(10)) }
    }

    private func resendRow(_ send: @escaping @MainActor () async throws -> Void) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            HStack {
                Button("Send it again") {
                    run("resend") {
                        try await send()
                        sentAt = .now
                        resentAt = .now
                    }
                }
                .buttonStyle(.quiet)
                .disabled(busy || context.date.timeIntervalSince(sentAt) < 30)
                if let resentAt {
                    Text("Sent again at \(resentAt.formatted(date: .omitted, time: .shortened))")
                        .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                }
            }
        }
    }

    private func label(_ text: String) -> some View {
        Text(text).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink2).accessibilityHidden(true)
    }

    private func quiet(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action).buttonStyle(.quiet).disabled(busy)
    }

    private var rule: some View { Rectangle().fill(Tokens.Colors.rule).frame(height: 1) }

    @ViewBuilder private var errorLine: some View {
        if let error {
            Text(error.message).dFont(.small).foregroundStyle(Tokens.Colors.alarmText)
        }
    }

    private func busyLabel(_ id: String, busy busyTitle: String, idle: String, icon: String? = nil) -> some View {
        HStack(spacing: Tokens.Space.s2) {
            if working == id {
                ProgressView().tint(Tokens.Colors.leaf).controlSize(.small)
            } else if let icon {
                Icon(icon, size: 18)
            }
            Text(working == id ? busyTitle : idle)
        }
    }

    // MARK: Actions

    private func go(_ next: Step) {
        step = next
        code = ""
        error = nil
        resentAt = nil
    }

    private func sendLink() {
        let to = address
        guard to.contains("@"), !busy else { return }
        run("send") {
            try await store.sendCode(email: to)
            go(.code(to))
            sentAt = .now
            focused = .code
        }
    }

    private func finishApple(_ result: Result<ASAuthorization, any Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let data = credential.identityToken, let token = String(data: data, encoding: .utf8) else {
                error = .providerFailed("Apple")
                return
            }
            let nonce = appleNonce
            run("apple") { try await store.signInWithApple(idToken: token, nonce: nonce) }
        case .failure(let failure):
            // Cancelled: no message (06 M-AUTH-01).
            if (failure as? ASAuthorizationError)?.code == .canceled { return }
            error = .providerFailed("Apple")
        }
    }

    private func signInWithGoogle() {
        let session = webAuthenticationSession
        run("google") {
            do {
                try await store.signInWithGoogle { url in
                    try await session.authenticate(using: url, callbackURLScheme: AuthFlow.oauthScheme)
                }
            } catch let failure as ASWebAuthenticationSessionError where failure.code == .canceledLogin {
                return
            } catch let failure as AuthError {
                throw failure
            } catch {
                throw AuthError.providerFailed("Google")
            }
        }
    }

    private func signInWithPassword() {
        guard address.contains("@"), !password.isEmpty, !busy else { return }
        let to = address, secret = password
        run("password") { try await store.signIn(email: to, password: secret) }
    }

    private func signUp() {
        guard address.contains("@"), !busy else { return }
        guard AuthFlow.isAcceptablePassword(password) else { error = .weakPassword; return }
        let to = address, secret = password, who = name.trimmingCharacters(in: .whitespaces)
        run("signup") {
            if try await !store.signUp(email: to, password: secret, name: who) {
                go(.code(to))
                sentAt = .now
                focused = .code
            }
        }
    }

    private func sendReset() {
        guard address.contains("@") else { focused = .email; return }
        let to = address
        run("reset-send") {
            try await store.sendReset(email: to)
            go(.reset(to))
            password = ""
            sentAt = .now
            focused = .code
        }
    }

    private func resetPassword() {
        guard case .reset(let to) = step, code.count >= 6, !busy else { return }
        guard AuthFlow.isAcceptablePassword(password) else { error = .weakPassword; return }
        let secret = password, typed = code
        run("reset") { try await store.resetPassword(email: to, code: typed, newPassword: secret) }
    }

    private func run(_ id: String, _ work: @escaping @MainActor () async throws -> Void) {
        working = id
        error = nil
        Task {
            do { try await work() } catch { self.error = error as? AuthError ?? .server }
            working = nil
        }
    }
}

/// D TextInput (02 §7.3): leaf fill, control-border hairline, a 2pt ink border when focused, 52 tall on the phone.
struct DTextInput: ViewModifier {
    let focused: Bool
    func body(content: Content) -> some View {
        content
            .dFont(.body)
            .foregroundStyle(Tokens.Colors.ink)
            .padding(.horizontal, Tokens.Space.s3)
            .frame(minHeight: Tokens.Size.phoneButton)
            .background(Tokens.Colors.leaf)
            .overlay {
                RoundedRectangle(cornerRadius: Tokens.Radius.m)
                    .strokeBorder(focused ? Tokens.Colors.ink : Tokens.Colors.controlBorder, lineWidth: focused ? 2 : 1)
            }
    }
}
