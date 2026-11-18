import AuthenticationServices
import SwiftUI

/// M-AUTH-01 (06 §3): the setup board with the wordmark, then a leaf with the ways in.
/// Phase 0 signs in by email code only; Apple and passkeys are shown disabled with their reason.
struct SignInView: View {
    @Environment(SessionStore.self) private var store
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.colorScheme) private var colorScheme

    @State private var email = ""
    @State private var code = ""
    @State private var sentTo: String?
    @State private var sentAt = Date.distantPast
    @State private var resentAt: Date?
    @State private var busy = false
    @State private var error: AuthError?
    @FocusState private var focused: Field?

    private enum Field { case email, code }

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
        .background(alignment: .top) {
            VStack(spacing: 0) { Section.setup.board; Tokens.Colors.leaf }.ignoresSafeArea()
        }
        .environment(\.section, .setup)
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
            if let sentTo { codeStep(sentTo) } else { emailStep }
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

    @ViewBuilder private var emailStep: some View {
        Button {} label: {
            Label { Text("Sign in with a passkey") } icon: { Icon("key-round", size: 18) }
        }
        .buttonStyle(.secondary)
        .disabled(true)
        reason("Passkeys arrive in a later version. Use your email for now.")

        SignInWithAppleButton(.continue) { _ in } onCompletion: { _ in }
            .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
            .frame(height: Tokens.Size.phoneButton)
            .disabled(true)
            .opacity(0.4)
        reason("Apple sign-in arrives in a later version. Use your email for now.")

        HStack(spacing: Tokens.Space.s3) {
            rule
            Text("or with your email").dFont(.caption).foregroundStyle(Tokens.Colors.ink3).fixedSize()
            rule
        }
        .padding(.vertical, Tokens.Space.s5)
        .accessibilityElement(children: .combine)

        Text("Email").dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink2)
        TextField("", text: $email, prompt: Text("you@example.com").foregroundStyle(Tokens.Colors.ink3))
            .textContentType(.username)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.send)
            .focused($focused, equals: .email)
            .onSubmit(sendCode)
            .modifier(DTextInput(focused: focused == .email))
            .accessibilityLabel("Email")
        errorLine
        Button(action: sendCode) {
            busyLabel(busy ? "Sending" : "Email me a sign-in code", icon: "mail")
        }
        .buttonStyle(.primary)
        .disabled(busy || !email.contains("@"))
    }

    @ViewBuilder private func codeStep(_ address: String) -> some View {
        Text("Check your email").dFont(.heading).foregroundStyle(Tokens.Colors.ink).accessibilityAddTraits(.isHeader)
        Text("We sent a 6-digit code to \(address). Type it here.").dFont(.body).foregroundStyle(Tokens.Colors.ink)
        TextField("", text: $code)
            .textContentType(.oneTimeCode)
            .keyboardType(.numberPad)
            .font(.custom("LibreFranklin-Bold", size: 22, relativeTo: .title2).monospacedDigit())
            .focused($focused, equals: .code)
            .modifier(DTextInput(focused: focused == .code))
            .accessibilityLabel("6-digit code")
            .onChange(of: code) { _, new in code = String(new.filter(\.isNumber).prefix(10)) }
        errorLine
        Button { verify(address) } label: { busyLabel(busy ? "Signing in" : "Sign in") }
            .buttonStyle(.primary)
            .disabled(busy || code.count < 6)
        TimelineView(.periodic(from: .now, by: 1)) { context in
            HStack {
                Button("Send it again") { resend(address) }
                    .buttonStyle(.quiet)
                    .disabled(busy || context.date.timeIntervalSince(sentAt) < 30)
                if let resentAt {
                    Text("Sent again at \(resentAt.formatted(date: .omitted, time: .shortened))")
                        .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                }
            }
        }
        Button("Use a different email") {
            sentTo = nil
            code = ""
            error = nil
            resentAt = nil
        }
        .buttonStyle(.quiet)
        .disabled(busy)
    }

    private var rule: some View { Rectangle().fill(Tokens.Colors.rule).frame(height: 1) }

    private func reason(_ text: String) -> some View {
        Text(text).dFont(.small).foregroundStyle(Tokens.Colors.ink3).padding(.bottom, Tokens.Space.s2)
    }

    @ViewBuilder private var errorLine: some View {
        if let error {
            Text(error.message).dFont(.small).foregroundStyle(Tokens.Colors.alarmText)
        }
    }

    private func busyLabel(_ title: String, icon: String? = nil) -> some View {
        HStack(spacing: Tokens.Space.s2) {
            if busy {
                ProgressView().tint(Tokens.Colors.leaf).controlSize(.small)
            } else if let icon {
                Icon(icon, size: 18)
            }
            Text(title)
        }
    }

    private func sendCode() {
        let address = email.trimmingCharacters(in: .whitespaces).lowercased()
        guard address.contains("@"), !busy else { return }
        run {
            try await store.sendCode(email: address)
            sentTo = address
            sentAt = .now
            focused = .code
        }
    }

    private func resend(_ address: String) {
        run {
            try await store.sendCode(email: address)
            sentAt = .now
            resentAt = .now
        }
    }

    private func verify(_ address: String) {
        run { try await store.verify(email: address, code: code) }
    }

    private func run(_ work: @escaping @MainActor () async throws -> Void) {
        busy = true
        error = nil
        Task {
            do { try await work() } catch { self.error = error as? AuthError ?? .server }
            busy = false
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
